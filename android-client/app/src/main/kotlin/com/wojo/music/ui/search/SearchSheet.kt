package com.wojo.music.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wojo.music.WojoColors
import com.wojo.music.protocol.SocketClient
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun SearchSheet(
    socket: SocketClient,
    onDismiss: () -> Unit
) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<SearchResult>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var searched by remember { mutableStateOf(false) }
    var addedIds by remember { mutableStateOf(setOf<String>()) }
    var error by remember { mutableStateOf<String?>(null) }

    val scope = rememberCoroutineScope()
    val debounceJob = remember { mutableStateOf<Job?>(null) }

    fun doSearch(q: String) {
        if (q.isBlank()) {
            results = emptyList()
            searched = false
            return
        }
        loading = true
        error = null
        scope.launch {
            try {
                // TODO: Implement HTTP search via Ktor or the server's /api/music-search endpoint
                delay(500)
                loading = false
                searched = true
            } catch (e: Exception) {
                error = e.message
                loading = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxHeight(0.8f)
            .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
            .background(WojoColors.DarkSurface)
            .padding(16.dp)
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "🔍 Search YouTube",
                color = WojoColors.TextPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
            TextButton(onClick = onDismiss) {
                Text("✕", color = WojoColors.TextSecondary, fontSize = 16.sp)
            }
        }

        // Search input with clear
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { q ->
                    query = q
                    debounceJob.value?.cancel()
                    debounceJob.value = scope.launch {
                        delay(300)
                        //doSearch(q) // placeholder - needs proper HTTP
                    }
                },
                placeholder = { Text("Search YouTube Music...", color = WojoColors.TextSecondary) },
                modifier = Modifier.weight(1f),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = WojoColors.Accent,
                    unfocusedBorderColor = WojoColors.TextSecondary,
                    cursorColor = WojoColors.Accent
                ),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(
                    onSearch = { /*doSearch(query)*/ }
                )
            )
            if (query.isNotEmpty()) {
                TextButton(
                    onClick = {
                        query = ""
                        results = emptyList()
                        searched = false
                        error = null
                    }
                ) {
                    Text("✕", color = WojoColors.TextSecondary, fontSize = 14.sp)
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Results area
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            if (loading) {
                item {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(20.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = WojoColors.Accent)
                    }
                }
            }

            if (error != null) {
                item {
                    Text("✕ ${error}", color = WojoColors.Danger, fontSize = 13.sp)
                }
            }

            if (!loading && searched && results.isEmpty()) {
                item {
                    Text(
                        "No results found",
                        color = WojoColors.TextSecondary,
                        modifier = Modifier.padding(20.dp)
                    )
                }
            }

            items(results) { item ->
                SearchResultItem(
                    item = item,
                    isAdded = addedIds.contains(item.videoId),
                    onAdd = {
                        socket.addToQueue(
                            com.wojo.music.protocol.Song(
                                title = item.title,
                                url = "https://www.youtube.com/watch?v=${item.videoId}",
                                source = "youtube",
                                videoId = item.videoId,
                                duration = item.duration
                            )
                        ) { result ->
                            if (result.success) {
                                addedIds = addedIds + item.videoId
                                scope.launch {
                                    delay(2000)
                                    addedIds = addedIds - item.videoId
                                }
                            }
                        }
                    }
                )
            }
        }
    }
}

data class SearchResult(
    val videoId: String,
    val title: String,
    val artist: String?,
    val thumbnail: String?,
    val duration: Float = 0f
)

@Composable
private fun SearchResultItem(
    item: SearchResult,
    isAdded: Boolean,
    onAdd: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(6.dp),
        color = WojoColors.DarkBackground.copy(alpha = 0.3f)
    ) {
        Row(
            modifier = Modifier.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Thumbnail placeholder
            Surface(
                modifier = Modifier.size(40.dp),
                shape = RoundedCornerShape(4.dp),
                color = WojoColors.DarkSurface
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text("🎵", fontSize = 18.sp)
                }
            }

            Spacer(modifier = Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    item.title,
                    color = WojoColors.TextPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    item.artist ?: "YouTube",
                    color = WojoColors.TextSecondary,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Button(
                onClick = onAdd,
                enabled = !isAdded,
                colors = ButtonDefaults.buttonColors(containerColor = WojoColors.Accent),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text(
                    if (isAdded) "✓ Added" else "+ Add",
                    color = WojoColors.DarkBackground,
                    fontSize = 12.sp
                )
            }
        }
    }
}