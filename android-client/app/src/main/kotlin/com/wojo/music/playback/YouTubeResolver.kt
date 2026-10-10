package com.wojo.music.playback

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.stream.StreamInfo
import javax.inject.Inject
import javax.inject.Singleton

data class ResolvedStream(
    val url: String,
    val userAgent: String
)

/**
 * Resolves a direct, fully-streamable YouTube audio URL on the device using
 * NewPipeExtractor (the same extraction stack BravePipe / Echo Music rely on).
 *
 * Running on the phone uses a residential IP (so no datacenter bot-check) and
 * NewPipeExtractor applies the signature / `n`-parameter transforms with Rhino,
 * which is what makes the returned URL stream end-to-end instead of being
 * throttled to the first ~1MB.
 */
@Singleton
class YouTubeResolver @Inject constructor() {

    companion object {
        private const val TAG = "YouTubeResolver"
        const val USER_AGENT = NewPipeDownloader.USER_AGENT
    }

    @Volatile
    private var initialized = false

    @Synchronized
    private fun ensureInit() {
        if (!initialized) {
            NewPipe.init(NewPipeDownloader(), Localization("en", "US"))
            initialized = true
        }
    }

    suspend fun resolveAudioUrl(videoId: String): ResolvedStream = withContext(Dispatchers.IO) {
        ensureInit()
        val info = StreamInfo.getInfo(
            ServiceList.YouTube,
            "https://www.youtube.com/watch?v=$videoId"
        )

        val audio = info.audioStreams.filter { !it.content.isNullOrBlank() }
        val best = audio
            .filter { it.format?.mimeType?.contains("mp4") == true }
            .maxByOrNull { it.averageBitrate }
            ?: audio.maxByOrNull { it.averageBitrate }
            ?: throw Exception("No audio stream found for $videoId")

        Log.d(
            TAG,
            "resolved $videoId itag=${best.itag} bitrate=${best.averageBitrate} mime=${best.format?.mimeType}"
        )
        ResolvedStream(best.content, USER_AGENT)
    }
}
