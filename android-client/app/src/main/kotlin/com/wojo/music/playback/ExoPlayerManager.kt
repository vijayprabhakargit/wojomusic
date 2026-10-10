package com.wojo.music.playback

import android.content.Context
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.wojo.music.protocol.Song
import com.wojo.music.protocol.SocketClient
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ExoPlayerManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val socket: SocketClient
) {
    companion object {
        private const val TAG = "ExoPlayerManager"

        // The server's YouTube proxy forwards the client User-Agent to
        // YouTube's CDN; a browser-like UA is the most compatible choice.
        private const val USER_AGENT =
            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

        // Ask for the whole (small) track in a single bounded range so the
        // server streams it in one request instead of many.
        private const val RANGE_HEADER = "bytes=0-104857600"
    }

    val player: ExoPlayer = ExoPlayer.Builder(context)
        .setMediaSourceFactory(
            DefaultMediaSourceFactory(
                DefaultHttpDataSource.Factory()
                    .setUserAgent(USER_AGENT)
                    .setDefaultRequestProperties(mapOf("Range" to RANGE_HEADER))
                    .setAllowCrossProtocolRedirects(true)
                    .setConnectTimeoutMs(15000)
                    .setReadTimeoutMs(30000)
            )
        )
        .setAudioAttributes(AudioAttributes.DEFAULT, true)
        .setHandleAudioBecomingNoisy(true)
        .build()

    // The URL currently loaded in the player, so we only reload on song change.
    private var currentUrl: String? = null

    private var onEndedCallback: (() -> Unit)? = null
    private var onErrorCallback: ((PlaybackException) -> Unit)? = null

    init {
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    onEndedCallback?.invoke()
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.e(TAG, "Playback error for $currentUrl: ${error.errorCodeName} - ${error.message}")
                currentUrl = null
                onErrorCallback?.invoke(error)
            }
        })
    }

    fun setOnEnded(callback: (() -> Unit)?) {
        onEndedCallback = callback
    }

    fun setOnError(callback: ((PlaybackException) -> Unit)?) {
        onErrorCallback = callback
    }

    /**
     * Resolve a playable absolute URL for a queue song. YouTube songs route
     * through the server proxy; local/Drive streams use their server path.
     */
    fun resolveUrl(song: Song): String? {
        val base = socket.baseUrl.trimEnd('/')

        val stream = song.streamUrl
        if (!stream.isNullOrBlank()) {
            return if (stream.startsWith("http")) stream else base + stream
        }

        if (song.source == "youtube" && !song.videoId.isNullOrBlank()) {
            return "$base/api/youtube-audio/${song.videoId}"
        }

        val url = song.url
        if (!url.isNullOrBlank()) {
            if (url.startsWith("http")) return url
            if (url.startsWith("/")) return base + url
        }
        return null
    }

    /** Load and play [song], optionally starting at [startPositionSeconds]. */
    fun playSong(song: Song, startPositionSeconds: Float = 0f) {
        val url = resolveUrl(song) ?: return
        if (url != currentUrl) {
            Log.d(TAG, "Loading ${song.source} song \"${song.title}\" from $url")
            currentUrl = url
            player.setMediaItem(MediaItem.fromUri(url))
            player.prepare()
        }
        if (startPositionSeconds > 0f) {
            player.seekTo((startPositionSeconds * 1000).toLong())
        }
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

    fun stop() {
        player.stop()
        player.clearMediaItems()
        currentUrl = null
    }

    fun release() = player.release()
}
