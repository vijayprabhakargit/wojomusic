package com.wojo.music.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wojo.music.protocol.SocketClient
import dagger.hilt.android.lifecycle.HiltViewModel
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@Serializable
data class SearchSong(
    val videoId: String = "",
    val title: String = "",
    val artist: String = "",
    val duration: Float = 0f,
    val thumbnail: String = ""
)

@Serializable
data class SearchResponse(
    val results: List<SearchSong> = emptyList(),
    val continuation: String? = null
)

@Serializable
private data class ContinuationPayload(val continuation: String)

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val httpClient: HttpClient,
    private val socket: SocketClient
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _results = MutableStateFlow<List<SearchSong>>(emptyList())
    val results: StateFlow<List<SearchSong>> = _results.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _searched = MutableStateFlow(false)
    val searched: StateFlow<Boolean> = _searched.asStateFlow()

    private var continuation: String? = null
    private var debounceJob: Job? = null

    private val baseUrl: String get() = socket.baseUrl.trimEnd('/')

    fun onQueryChange(value: String) {
        _query.value = value
        debounceJob?.cancel()
        if (value.isBlank()) {
            _results.value = emptyList()
            _searched.value = false
            _error.value = null
            return
        }
        debounceJob = viewModelScope.launch {
            delay(300)
            search(value)
        }
    }

    fun search(query: String = _query.value) {
        val q = query.trim()
        if (q.isEmpty()) return
        debounceJob?.cancel()
        _loading.value = true
        _error.value = null
        continuation = null
        viewModelScope.launch {
            try {
                val response: SearchResponse = httpClient.get("$baseUrl/api/music-search") {
                    parameter("q", q)
                }.body()
                _results.value = response.results
                continuation = response.continuation
                _searched.value = true
            } catch (e: Exception) {
                _error.value = e.message ?: "Search failed"
                _results.value = emptyList()
            } finally {
                _loading.value = false
            }
        }
    }

    fun loadMore() {
        val token = continuation ?: return
        if (_loading.value) return
        _loading.value = true
        viewModelScope.launch {
            try {
                val response: SearchResponse = httpClient.post("$baseUrl/api/music-search/more") {
                    contentType(ContentType.Application.Json)
                    setBody(ContinuationPayload(token))
                }.body()
                _results.value = _results.value + response.results
                continuation = response.continuation
            } catch (e: Exception) {
                _error.value = e.message ?: "Load more failed"
            } finally {
                _loading.value = false
            }
        }
    }

    fun clear() {
        debounceJob?.cancel()
        _query.value = ""
        _results.value = emptyList()
        _searched.value = false
        _error.value = null
        continuation = null
    }

    fun addToQueue(song: SearchSong, onAdded: (Boolean) -> Unit) {
        socket.addToQueue(
            com.wojo.music.protocol.Song(
                title = song.title,
                url = "https://www.youtube.com/watch?v=${song.videoId}",
                source = "youtube",
                videoId = song.videoId,
                duration = song.duration
            )
        ) { result ->
            onAdded(result.success)
        }
    }
}
