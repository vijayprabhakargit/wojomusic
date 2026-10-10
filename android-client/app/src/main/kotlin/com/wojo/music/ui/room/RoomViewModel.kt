package com.wojo.music.ui.room

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import android.util.Log
import com.wojo.music.playback.ExoPlayerManager
import com.wojo.music.protocol.PlayerState
import com.wojo.music.protocol.SocketClient
import com.wojo.music.protocol.Song
import com.wojo.music.protocol.SyncManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class RoomViewModel @Inject constructor(
    val socket: SocketClient,
    val playerManager: ExoPlayerManager,
    private val syncManager: SyncManager
) : ViewModel() {

    private val _localPosition = MutableStateFlow(0f)
    val localPosition: StateFlow<Float> = _localPosition.asStateFlow()

    private val _duration = MutableStateFlow(0f)
    val duration: StateFlow<Float> = _duration.asStateFlow()

    // Song id currently loaded into ExoPlayer, so we reload only on change.
    private var loadedSongId: String? = null

    // Retry state for transient stream errors (e.g. a 502 while the server's
    // YouTube identity rotates).
    private var retryJob: Job? = null
    private var retrySongId: String? = null
    private var retryAttempt = 0

    init {
        syncManager.start(viewModelScope)

        // Auto-advance the queue when a track finishes (controllers only;
        // listeners just follow the server state).
        playerManager.setOnEnded {
            val role = socket.myInfo.value?.role
            Log.d("RoomViewModel", "Track ended; role=$role")
            if (role == "admin" || role == "moderator") {
                socket.nextTrack()
            }
        }

        // Retry playback with backoff on transient errors.
        playerManager.setOnError {
            scheduleRetry()
        }

        // Drive the local player from authoritative server state.
        viewModelScope.launch {
            socket.playerState.collect { ps -> applyServerState(ps) }
        }

        // Update local position/duration periodically for the UI.
        viewModelScope.launch {
            while (true) {
                _localPosition.value = playerManager.getPosition()
                _duration.value = playerManager.getDuration()
                delay(250)
            }
        }
    }

    private fun scheduleRetry() {
        val ps = socket.playerState.value ?: return
        val song = ps.currentSong ?: return
        if (song.id != retrySongId) {
            retrySongId = song.id
            retryAttempt = 0
        }
        // Ride out transient server errors (the YouTube proxy can return 502
        // while its stream identity rotates) with capped backoff.
        if (retryAttempt >= 12) return
        retryAttempt++
        loadedSongId = null
        val delayMs = when (retryAttempt) {
            1 -> 2000L
            2 -> 4000L
            3 -> 8000L
            else -> 15000L
        }
        retryJob?.cancel()
        retryJob = viewModelScope.launch {
            delay(delayMs)
            applyServerState(socket.playerState.value)
        }
    }

    private fun applyServerState(ps: PlayerState?) {
        val song = ps?.currentSong
        if (song == null) {
            loadedSongId = null
            playerManager.pause()
            return
        }

        if (song.id != loadedSongId) {
            // A song may be announced before its stream is ready (e.g. a
            // Google Drive download in progress). Wait for the next state.
            if (playerManager.resolveUrl(song) == null) return
            loadedSongId = song.id
            playerManager.playSong(song, ps.position)
        } else {
            // Same song: reconcile play/pause and drift.
            syncManager.applyPlayerState(ps)
        }
    }

    // ── Player controls ──

    fun play() = socket.play()
    fun pause() = socket.pause()
    fun nextTrack() = socket.nextTrack()
    fun prevTrack() = socket.prevTrack()

    fun seek(position: Float) {
        playerManager.seek(position)
        socket.seek(position)
    }

    fun playFromQueue(index: Int) {
        socket.playFromQueue(index)
    }

    // ── Queue actions ──

    fun addToQueue(song: Song) {
        socket.addToQueue(song)
    }

    fun removeFromQueue(songId: String) {
        socket.removeFromQueue(songId)
    }

    fun reorderQueue(from: Int, to: Int) {
        socket.reorderQueue(from, to)
    }

    // ── Room ──

    fun leaveRoom() {
        retryJob?.cancel()
        syncManager.stop()
        playerManager.setOnEnded(null)
        playerManager.setOnError(null)
        playerManager.pause()
        playerManager.stop()
        loadedSongId = null
        socket.leaveRoom()
    }

    override fun onCleared() {
        retryJob?.cancel()
        syncManager.stop()
        playerManager.setOnEnded(null)
        playerManager.setOnError(null)
        playerManager.pause()
        super.onCleared()
    }

    fun formatTime(seconds: Float): String {
        if (seconds.isNaN() || !seconds.isFinite()) return "0:00"
        val mins = (seconds / 60).toInt()
        val secs = (seconds % 60).toInt()
        return "$mins:${secs.toString().padStart(2, '0')}"
    }
}
