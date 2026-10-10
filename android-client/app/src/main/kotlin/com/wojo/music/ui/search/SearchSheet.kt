package com.wojo.music.ui.search

import androidx.compose.foundation.background
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
import androidx.hilt.navigation.compose.hiltViewModel
import com.wojo.music.WojoColors
import kotlinx.coroutines.launch

@Composable
fun SearchSheet(
    onDismiss: () -> Unit
) {
    val viewModel: SearchViewModel = hiltViewModel()
    val query by viewModel.query.collectAsState()
    val results by viewModel.results.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()
    val searched by viewModel.searched.collectAsState()

    var addedIds by remember { mutableStateOf(setOf<String>()) }

    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    // Infinite scroll: load the next page when scrolled near the end.
    val shouldLoadMore by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1
            last >= results.size - 3 && results.isNotEmpty()
        }
    }
    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) viewModel.loadMore()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(12.dp))
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

        // Search input
        OutlinedTextField(
            value = query,
            onValueChange = { viewModel.onQueryChange(it) },
            placeholder = { Text("Search YouTube Music...", color = WojoColors.TextSecondary) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            trailingIcon = {
                if (query.isNotEmpty()) {
                    TextButton(onClick = { viewModel.clear() }) {
                        Text("✕", color = WojoColors.TextSecondary, fontSize = 14.sp)
                    }
                }
            },
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = WojoColors.Accent,
                unfocusedBorderColor = WojoColors.TextSecondary,
                cursorColor = WojoColors.Accent,
                focusedTextColor = WojoColors.TextPrimary,
                unfocusedTextColor = WojoColors.TextPrimary
            ),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { viewModel.search() })
        )

        Spacer(modifier = Modifier.height(8.dp))

        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            if (error != null) {
                item {
                    Text(
                        "✕ $error",
                        color = WojoColors.Danger,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            if (!loading && searched && results.isEmpty() && error == null) {
                item {
                    Text(
                        "No results found for \"$query\"",
                        color = WojoColors.TextSecondary,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(20.dp)
                    )
                }
            }

            if (!searched && query.isBlank()) {
                item {
                    Text(
                        "🔎 Search for any song or artist to add it to the queue",
                        color = WojoColors.TextSecondary,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(20.dp)
                    )
                }
            }

            items(results) { item ->
                SearchResultItem(
                    item = item,
                    isAdded = addedIds.contains(item.videoId),
                    onAdd = {
                        viewModel.addToQueue(item) { success ->
                            if (success) {
                                scope.launch { addedIds = addedIds + item.videoId }
                            }
                        }
                    }
                )
            }

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
        }
    }
}

private fun formatDuration(seconds: Float): String {
    if (seconds <= 0f || !seconds.isFinite()) return ""
    val total = seconds.toInt()
    val m = total / 60
    val s = total % 60
    return "$m:${s.toString().padStart(2, '0')}"
}

@Composable
private fun SearchResultItem(
    item: SearchSong,
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
                    item.artist.ifBlank { "YouTube" },
                    color = WojoColors.TextSecondary,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            val dur = formatDuration(item.duration)
            if (dur.isNotEmpty()) {
                Text(
                    dur,
                    color = WojoColors.TextSecondary,
                    fontSize = 11.sp,
                    modifier = Modifier.padding(horizontal = 6.dp)
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
