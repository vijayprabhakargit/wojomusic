package com.wojo.music.playback

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class InnerTubeResolver @Inject constructor(
    private val httpClient: HttpClient
) {
    companion object {
        private const val INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
        private const val CLIENT_NAME = "WEB"
        private const val CLIENT_VERSION = "2.20250204.00.00"
    }

    suspend fun resolveAudioUrl(videoId: String): String {
        val body = buildPlayerBody(videoId)
        val response: PlayerResponse = httpClient.post(INNERTUBE_URL) {
            contentType(ContentType.Application.Json)
            setBody(body)
        }.body()

        val audioFormat = response.streamingData?.adaptiveFormats
            ?.filter { it.mimeType.startsWith("audio/") }
            ?.maxByOrNull { it.bitrate ?: 0 }
            ?: response.streamingData?.formats
                ?.filter { it.mimeType.startsWith("audio/") }
                ?.maxByOrNull { it.bitrate ?: 0 }

        return audioFormat?.url
            ?: audioFormat?.signatureCipher?.let { extractUrlFromCipher(it) }
            ?: throw Exception("No audio stream found for video $videoId")
    }

    private fun buildPlayerBody(videoId: String): JsonObject {
        return buildJsonObject {
            put("videoId", videoId)
            put("context", buildJsonObject {
                put("client", buildJsonObject {
                    put("clientName", CLIENT_NAME)
                    put("clientVersion", CLIENT_VERSION)
                })
            })
        }
    }

    private fun extractUrlFromCipher(cipher: String): String? {
        val params = cipher.split("&").associate { param ->
            val parts = param.split("=", limit = 2)
            parts[0] to (parts.getOrNull(1)?.let { java.net.URLDecoder.decode(it, "UTF-8") } ?: "")
        }
        return params["url"]
    }
}

@Serializable
data class PlayerResponse(
    val streamingData: StreamingData? = null,
    val playabilityStatus: PlayabilityStatus? = null
)

@Serializable
data class StreamingData(
    val formats: List<Format>? = null,
    val adaptiveFormats: List<Format>? = null
)

@Serializable
data class Format(
    val itag: Int? = null,
    val mimeType: String = "",
    val bitrate: Int? = null,
    val url: String? = null,
    val signatureCipher: String? = null
)

@Serializable
data class PlayabilityStatus(
    val status: String? = null
)