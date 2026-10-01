package com.wojo.music.protocol

import android.util.Log
import com.wojo.music.playback.ExoPlayerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Runs two periodic coroutines:
 * 1. Progress reporter — every 1s, emit [player:progress] with current ExoPlayer position
 * 2. Drift sync — every 5s, emit [player:sync] with { clientPosition, clientTimestamp }
 *
 * Also receives [player:state] from the server; if the server says isPlaying=true
 * but the local ExoPlayer is paused (drift), seek to the live expected position.
 */
@Singleton
class SyncManager @Inject constructor(
    private val playerManager: ExoPlayerManager,
    private val socket: SocketClient
) {
    private var progressJob: Job? = null
    private var syncJob: Job? = null
    private var isRunning = false

    fun start(scope: CoroutineScope) {
        if (isRunning) return
        isRunning = true

        // Progress reporter — every 1s
        progressJob = scope.launch {
            while (isActive) {
                if (socket.isConnected() && playerManager.isPlaying()) {
                    socket.reportProgress(playerManager.getPosition())
                }
                delay(1000)
            }
        }

        // Drift sync — every 5s
        syncJob = scope.launch {
            while (isActive) {
                if (socket.isConnected() && playerManager.isPlaying()) {
                    socket.syncPosition(playerManager.getPosition(), System.currentTimeMillis())
                }
                delay(5000)
            }
        }
    }

    fun stop() {
        isRunning = false
        progressJob?.cancel()
        progressJob = null
        syncJob?.cancel()
        syncJob = null
    }

    /**
     * Apply server player state to ExoPlayer.
     * If server says playing but local player is paused, seek to expected position.
     */
    fun applyPlayerState(playerState: PlayerState?) {
        if (playerState == null) return

        val serverPlaying = playerState.isPlaying
        val localPlaying = playerManager.isPlaying()
        val expectedPosition = livePosition(playerState)

        if (serverPlaying && !localPlaying) {
            playerManager.play()
            if (expectedPosition > 0) {
                playerManager.seek(expectedPosition)
            }
        } else if (!serverPlaying && localPlaying) {
            playerManager.pause()
        }

        // Drift correction: if difference > 2s, seek
        val drift = kotlin.math.abs(playerManager.getPosition() - expectedPosition)
        if (drift > 2f && serverPlaying) {
            playerManager.seek(expectedPosition)
        }
    }

    private fun livePosition(ps: PlayerState): Float {
        val base = ps.position
        if (!ps.isPlaying || ps.lastUpdated == 0L) return base
        val elapsed = (System.currentTimeMillis() - ps.lastUpdated) / 1000f
        return base + maxOf(0f, elapsed)
    }
}