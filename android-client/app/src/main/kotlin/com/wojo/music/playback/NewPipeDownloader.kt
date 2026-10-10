package com.wojo.music.playback

import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

/**
 * Minimal NewPipeExtractor [Downloader] backed by HttpURLConnection.
 *
 * NewPipeExtractor uses this for all of its own HTTP requests, including
 * fetching and evaluating YouTube's player.js to transform the throttling
 * (`n`) and signature (`s`) parameters — the piece the raw InnerTube approach
 * was missing.
 */
class NewPipeDownloader : Downloader() {

    companion object {
        const val USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }

    override fun execute(request: Request): Response {
        val connection = (URL(request.url()).openConnection() as HttpURLConnection).apply {
            requestMethod = request.httpMethod()
            connectTimeout = 30000
            readTimeout = 30000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", USER_AGENT)
            setRequestProperty("Accept-Encoding", "gzip")
            request.headers().forEach { (key, values) ->
                if (key != null && !values.isNullOrEmpty()) {
                    setRequestProperty(key, values.joinToString(", "))
                }
            }
        }

        request.dataToSend()?.let { data ->
            connection.doOutput = true
            connection.setFixedLengthStreamingMode(data.size)
            connection.outputStream.use { it.write(data) }
        }

        val code = connection.responseCode
        val message = connection.responseMessage ?: ""
        val headers = connection.headerFields.filterKeys { it != null }
        val latestUrl = connection.url?.toString() ?: request.url()

        val body = try {
            val raw = if (code >= 400) connection.errorStream else connection.inputStream
            raw?.let { stream ->
                val gzipped = headers.entries.any {
                    it.key.equals("Content-Encoding", ignoreCase = true) &&
                        it.value.any { v -> v.contains("gzip", ignoreCase = true) }
                }
                val decoded = if (gzipped) GZIPInputStream(stream) else stream
                decoded.bufferedReader().use { it.readText() }
            } ?: ""
        } catch (e: Exception) {
            ""
        }
        connection.disconnect()

        return Response(code, message, headers, body, latestUrl)
    }
}
