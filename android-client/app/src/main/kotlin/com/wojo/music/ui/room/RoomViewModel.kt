package com.wojo.music.ui.room

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wojo.music.playback.ExoPlayerManager
import com.wojo.music.protocol.PlayerState
import com.wojo.music.protocol.SocketClient
import com.wojo.music.protocol.Song
import com.wojo.music.protocol.SyncManager
import dagger.hilt.android.lifecycle.HiltViewModel
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

    val canControl: Boolean
        get() {
            val myInfo = socket.myInfo.value
            return myInfo != null && (myInfo.role == "admin" || myInfo.role == "moderator")
        }

    init {
        syncManager.start(viewModelScope)

        // Update local position periodically for UI
        viewModelScope.launch {
            while (true) {
                _localPosition.value = playerManager.getPosition()
                _duration.value = playerManager.getDuration()
                kotlinx.coroutines.delay(250)
            }
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
        syncManager.stop()
        playerManager.pause()
        socket.leaveRoom()
    }

    override fun onCleared() {
        syncManager.stop()
        super.onCleared()
    }

    fun formatTime(seconds: Float): String {
        if (seconds.isNaN() || !seconds.isFinite()) return "0:00"
        val mins = (seconds / 60).toInt()
        val secs = (seconds % 60).toInt()
        return "$mins:${secs.toString().padStart(2, '0')}"
    }
}