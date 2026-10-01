package com.wojo.music.playback

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import com.wojo.music.protocol.Song
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.runBlocking
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ExoPlayerManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val innerTubeResolver: InnerTubeResolver
) {
    val player: ExoPlayer = ExoPlayer.Builder(context)
        .setAudioAttributes(AudioAttributes.DEFAULT, true)
        .setHandleAudioBecomingNoisy(true)
        .build()

    fun playSong(song: Song) {
        val uri = if (song.source == "youtube" && song.videoId != null) {
            try {
                runBlocking { innerTubeResolver.resolveAudioUrl(song.videoId) }
            } catch (e: Exception) {
                song.streamUrl ?: song.url
            }
        } else {
            song.streamUrl ?: song.url
        }

        val mediaItem = MediaItem.fromUri(uri)
        player.setMediaItem(mediaItem)
        player.prepare()
        player.play()
    }

    fun play() = player.play()

    fun pause() = player.pause()

    fun seek(positionSeconds: Float) {
        player.seekTo((positionSeconds * 1000).toLong())
    }

    fun getPosition(): Float = player.currentPosition / 1000f

    fun getDuration(): Float = if (player.duration > 0) player.duration / 1000f else 0f

    fun isPlaying(): Boolean = player.isPlaying

    fun release() = player.release()
}