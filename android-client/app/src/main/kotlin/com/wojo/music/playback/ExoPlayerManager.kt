package com.wojo.music.playback

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.wojo.music.protocol.Song
import com.wojo.music.protocol.SocketClient
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ExoPlayerManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val socket: SocketClient,
    private val youTubeResolver: YouTubeResolver
) {
    companion object {
        private const val TAG = "ExoPlayerManager"
        private const val USER_AGENT = YouTubeResolver.USER_AGENT

        // YouTube's CDN rejects open-ended ranges (ExoPlayer's default) and
        // only serves bounded chunks, so YouTube audio is fetched in <=1MB
        // bounded ranges and played from a local cache file.
        private const val CHUNK = 1024L * 1024L
    }

    val player: ExoPlayer = ExoPlayer.Builder(context)
        .setMediaSourceFactory(
            DefaultMediaSourceFactory(
                DefaultDataSource.Factory(
                    context,
                    DefaultHttpDataSource.Factory()
                        .setUserAgent(USER_AGENT)
                        .setAllowCrossProtocolRedirects(true)
                        .setConnectTimeoutMs(15000)
                        .setReadTimeoutMs(30000)
                )
            )
        )
        .setAudioAttributes(AudioAttributes.DEFAULT, true)
        .setHandleAudioBecomingNoisy(true)
        .build()

    private val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // Identifies what is currently loaded/being prepared (a YouTube videoId key
    // or a resolved URL), so we only (re)load on change.
    private var currentKey: String? = null

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
                Log.e(TAG, "Playback error for $currentKey: ${error.errorCodeName} - ${error.message}")
                currentKey = null
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

    /** Server-relative URL for non-YouTube songs (local uploads, Drive). */
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
        val isYoutube = song.source == "youtube" && !song.videoId.isNullOrBlank()
        val key = if (isYoutube) "yt:${song.videoId}" else resolveUrl(song)
        if (key == null) return

        if (key == currentKey) {
            if (startPositionSeconds > 0f) player.seekTo((startPositionSeconds * 1000).toLong())
            player.play()
            return
        }
        currentKey = key

        if (isYoutube) {
            val videoId = song.videoId!!
            ioScope.launch {
                val resolved = runCatching { youTubeResolver.resolveAudioUrl(videoId) }
                    .onFailure { Log.w(TAG, "Device-side resolve failed for $videoId: ${it.message}") }
                    .getOrNull()
                val srcUrl = resolved?.url ?: resolveUrl(song)
                val userAgent = resolved?.userAgent ?: USER_AGENT
                val file = if (srcUrl != null) download(srcUrl, videoId, userAgent) else null
                withContext(Dispatchers.Main) {
                    if (currentKey != key) return@withContext
                    val playUri = file?.let { Uri.fromFile(it).toString() } ?: srcUrl ?: return@withContext
                    Log.d(TAG, "Playing youtube \"${song.title}\" ${if (file != null) "from cache" else "directly"}")
                    setMediaAndPlay(playUri, startPositionSeconds, song.title, "YouTube")
                }
            }
        } else {
            Log.d(TAG, "Loading ${song.source} song \"${song.title}\" from $key")
            setMediaAndPlay(key, startPositionSeconds, song.title, song.addedBy)
        }
    }

    private fun setMediaAndPlay(uri: String, startPositionSeconds: Float, title: String, artist: String) {
        val metadata = MediaMetadata.Builder()
            .setTitle(title.ifBlank { "Wojo Music" })
            .setArtist(artist.ifBlank { "Wojo Music" })
            .build()
        player.setMediaItem(
            MediaItem.Builder()
                .setUri(uri)
                .setMediaMetadata(metadata)
                .build()
        )
        player.prepare()
        if (startPositionSeconds > 0f) {
            player.seekTo((startPositionSeconds * 1000).toLong())
        }
        player.play()
    }

    /**
     * Download [url] to the cache using bounded ranges (the CDN rejects open
     * ranges) with the same User-Agent the URL was resolved with. Returns the
     * cached file, or null on failure.
     */
    private suspend fun download(url: String, key: String, userAgent: String): File? = withContext(Dispatchers.IO) {
        val dir = File(context.cacheDir, "yt").apply { mkdirs() }
        val out = File(dir, "$key.media")
        if (out.exists() && out.length() > 0) return@withContext out

        val tmp = File(dir, "$key.tmp")
        try {
            var offset = 0L
            var total = -1L
            FileOutputStream(tmp).use { fos ->
                while (total < 0 || offset < total) {
                    val end = offset + CHUNK - 1
                    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                        setRequestProperty("User-Agent", userAgent)
                        setRequestProperty("Referer", "https://www.youtube.com/")
                        setRequestProperty("Range", "bytes=$offset-$end")
                        connectTimeout = 15000
                        readTimeout = 30000
                    }
                    try {
                        val code = conn.responseCode
                        if (code != 200 && code != 206) {
                            Log.w(TAG, "download HTTP $code at offset $offset for $url")
                            return@withContext null
                        }
                        val contentRange = conn.getHeaderField("Content-Range")
                        if (contentRange != null) {
                            contentRange.substringAfter('/', "").trim().toLongOrNull()
                                ?.let { if (it > 0) total = it }
                        } else if (code == 200 && conn.contentLengthLong > 0) {
                            total = conn.contentLengthLong
                        }

                        var wrote = 0
                        conn.inputStream.use { input ->
                            val buf = ByteArray(64 * 1024)
                            var read = input.read(buf)
                            while (read > 0) {
                                fos.write(buf, 0, read)
                                wrote += read
                                read = input.read(buf)
                            }
                        }
                        if (wrote == 0) break
                        offset += wrote
                        if (total < 0) break // unknown total: single fetch
                    } finally {
                        conn.disconnect()
                    }
                }
            }
            if (tmp.length() > 0) {
                if (out.exists()) out.delete()
                if (tmp.renameTo(out)) out else { tmp.delete(); null }
            } else {
                tmp.delete()
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "download failed for $url: ${e.message}")
            tmp.delete()
            null
        }
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
        currentKey = null
    }

    fun release() = player.release()
}
