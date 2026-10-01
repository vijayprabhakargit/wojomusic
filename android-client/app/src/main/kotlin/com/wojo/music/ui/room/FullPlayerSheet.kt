package com.wojo.music.ui.room

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wojo.music.WojoColors
import com.wojo.music.protocol.Song

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FullPlayerSheet(
    currentSong: Song?,
    localPosition: Float,
    duration: Float,
    isPlaying: Boolean,
    canControl: Boolean,
    formatTime: (Float) -> String,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onNext: () -> Unit,
    onPrev: () -> Unit,
    onSeek: (Float) -> Unit,
    onDismiss: () -> Unit
) {
    val progress = if (duration > 0) localPosition / duration else 0f

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxHeight(0.5f)
            .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
            .background(WojoColors.DarkSurface)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Artwork placeholder
        Surface(
            modifier = Modifier.size(200.dp),
            shape = RoundedCornerShape(12.dp),
            color = WojoColors.DarkBackground
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("🎵", fontSize = 64.sp)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Title & artist
        Text(
            currentSong?.title ?: "No track",
            color = WojoColors.TextPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            currentSong?.addedBy ?: "",
            color = WojoColors.TextSecondary,
            fontSize = 14.sp
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Progress bar + seek
        if (canControl && duration > 0) {
            Slider(
                value = progress,
                onValueChange = { onSeek(it * duration) },
                colors = SliderDefaults.colors(
                    thumbColor = WojoColors.Accent,
                    activeTrackColor = WojoColors.Accent,
                    inactiveTrackColor = WojoColors.DarkBackground
                )
            )
        } else {
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp)),
                color = WojoColors.Accent,
                trackColor = WojoColors.DarkBackground
            )
        }

        // Time labels
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(formatTime(localPosition), color = WojoColors.TextSecondary, fontSize = 12.sp)
            Text(formatTime(duration), color = WojoColors.TextSecondary, fontSize = 12.sp)
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Controls
        Row(
            horizontalArrangement = Arrangement.spacedBy(24.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onPrev, enabled = canControl) {
                Text("⏮", fontSize = 24.sp)
            }
            IconButton(
                onClick = { if (isPlaying) onPause() else onPlay() },
                enabled = canControl
            ) {
                Text(if (isPlaying) "⏸" else "▶️", fontSize = 36.sp)
            }
            IconButton(onClick = onNext, enabled = canControl) {
                Text("⏭", fontSize = 24.sp)
            }
        }
    }
}