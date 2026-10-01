package com.wojo.music.ui.queue

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.wojo.music.protocol.Song

@Composable
fun QueueSheet(
    queue: List<Song>,
    currentIndex: Int,
    canControl: Boolean,
    formatTime: (Float) -> String,
    onRemove: (String) -> Unit,
    onReorder: (Int, Int) -> Unit,
    onPlayFromQueue: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    // Simple drag-to-reorder is handled via buttons for now on Android
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxHeight(0.7f)
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
                "📋 Queue (${queue.size})",
                color = WojoColors.TextPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
            TextButton(onClick = onDismiss) {
                Text("✕", color = WojoColors.TextSecondary, fontSize = 16.sp)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        if (queue.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("📼", fontSize = 28.sp)
                    Text(
                        "Queue is empty",
                        color = WojoColors.TextSecondary,
                        fontSize = 13.sp
                    )
                    Text(
                        "Tap 'Add Song' to add music",
                        color = WojoColors.TextSecondary,
                        fontSize = 11.sp
                    )
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                itemsIndexed(queue) { index, song ->
                    val isPlaying = index == currentIndex
                    QueueItem(
                        song = song,
                        index = index,
                        isPlaying = isPlaying,
                        canControl = canControl,
                        formatTime = formatTime,
                        onPlay = { onPlayFromQueue(index) },
                        onRemove = { onRemove(song.id) },
                        onMoveUp = {
                            if (index > 0) onReorder(index, index - 1)
                        },
                        onMoveDown = {
                            if (index < queue.size - 1) onReorder(index, index + 1)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun QueueItem(
    song: Song,
    index: Int,
    isPlaying: Boolean,
    canControl: Boolean,
    formatTime: (Float) -> String,
    onPlay: () -> Unit,
    onRemove: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !isPlaying && canControl) { onPlay() },
        shape = RoundedCornerShape(6.dp),
        color = if (isPlaying) WojoColors.Accent.copy(alpha = 0.15f)
                else WojoColors.DarkBackground.copy(alpha = 0.5f),
        border = if (isPlaying) androidx.compose.foundation.BorderStroke(1.dp, WojoColors.Accent) else null
    ) {
        Row(
            modifier = Modifier.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Index / playing indicator
            Text(
                if (isPlaying) "▶" else "${index + 1}",
                color = if (isPlaying) WojoColors.Accent else WojoColors.TextSecondary,
                fontSize = 12.sp,
                modifier = Modifier.width(24.dp)
            )

            // Song info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    song.title,
                    color = if (isPlaying) WojoColors.Accent else WojoColors.TextPrimary,
                    fontSize = 13.sp,
                    fontWeight = if (isPlaying) FontWeight.Bold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(song.addedBy, color = WojoColors.TextSecondary, fontSize = 10.sp)
                    Text(" · ", color = WojoColors.TextSecondary, fontSize = 10.sp)
                    Text(
                        when (song.source) {
                            "gdrive" -> "? Drive"
                            "youtube" -> "?? YouTube"
                            else -> "?? Local"
                        },
                        color = WojoColors.TextSecondary,
                        fontSize = 9.sp
                    )
                }
            }

            // Duration for playing item
            if (isPlaying) {
                Text(
                    formatTime(song.duration),
                    color = WojoColors.Success,
                    fontSize = 10.sp,
                    modifier = Modifier.padding(end = 4.dp)
                )
            }

            // Reorder / remove buttons
            if (canControl && !isPlaying) {
                Column {
                    TextButton(
                        onClick = onMoveUp,
                        contentPadding = PaddingValues(0.dp),
                        modifier = Modifier.size(24.dp)
                    ) {
                        Text("▲", fontSize = 10.sp, color = WojoColors.TextSecondary)
                    }
                    TextButton(
                        onClick = onMoveDown,
                        contentPadding = PaddingValues(0.dp),
                        modifier = Modifier.size(24.dp)
                    ) {
                        Text("▼", fontSize = 10.sp, color = WojoColors.TextSecondary)
                    }
                }
                TextButton(
                    onClick = onRemove,
                    contentPadding = PaddingValues(4.dp),
                    modifier = Modifier.size(24.dp)
                ) {
                    Text("✕", fontSize = 11.sp, color = WojoColors.Danger)
                }
            }
        }
    }
}