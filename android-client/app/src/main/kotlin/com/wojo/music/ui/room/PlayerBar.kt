package com.wojo.music.ui.room

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wojo.music.WojoColors
import com.wojo.music.protocol.Song

@Composable
fun PlayerBar(
    currentSong: Song?,
    localPosition: Float,
    duration: Float,
    isPlaying: Boolean,
    canControl: Boolean,
    formatTime: (Float) -> String,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onNext: () -> Unit,
    onPrev: () -> Unit
) {
    val progress = if (duration > 0) localPosition / duration else 0f

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(WojoColors.DarkSurface)
            .padding(12.dp)
    ) {
        // Song info
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = currentSong?.title ?: "No track playing",
                    color = if (currentSong != null) WojoColors.TextPrimary else WojoColors.TextSecondary,
                    fontSize = 14.sp,
                    fontWeight = if (currentSong != null) FontWeight.Bold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (currentSong != null) {
                    Text(
                        text = currentSong.addedBy,
                        color = WojoColors.TextSecondary,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // Playback controls
            if (canControl) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onPrev, enabled = canControl) {
                        Text("⏮", fontSize = 18.sp)
                    }
                    IconButton(onClick = { if (isPlaying) onPause() else onPlay() }, enabled = canControl) {
                        Text(if (isPlaying) "⏸" else "▶️", fontSize = 20.sp)
                    }
                    IconButton(onClick = onNext, enabled = canControl) {
                        Text("⏭", fontSize = 18.sp)
                    }
                }
            }
        }

        // Progress bar
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp)),
            color = WojoColors.Accent,
            trackColor = WojoColors.DarkBackground
        )

        // Time labels
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                formatTime(localPosition),
                color = WojoColors.TextSecondary,
                fontSize = 10.sp
            )
            Text(
                formatTime(duration),
                color = WojoColors.TextSecondary,
                fontSize = 10.sp
            )
        }
    }
}