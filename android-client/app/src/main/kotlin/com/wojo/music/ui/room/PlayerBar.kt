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
    role: String?,
    formatTime: (Float) -> String,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onNext: () -> Unit,
    onPrev: () -> Unit,
    onSeek: (Float) -> Unit
) {
    val hasSong = currentSong != null
    val maxDuration = if (duration > 0f) duration else 0f

    var scrubbing by remember { mutableStateOf(false) }
    var scrubValue by remember { mutableStateOf(0f) }
    val shownPosition = if (scrubbing) scrubValue else localPosition
    val sliderValue = shownPosition.coerceIn(0f, if (maxDuration > 0f) maxDuration else 0f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(WojoColors.DarkSurface)
            .padding(12.dp)
    ) {
        // ── Now playing + status/role ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = currentSong?.title ?: "No track playing",
                    color = if (hasSong) WojoColors.TextPrimary else WojoColors.TextSecondary,
                    fontSize = 14.sp,
                    fontWeight = if (hasSong) FontWeight.Bold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (hasSong) {
                    Text(
                        text = "added by ${currentSong?.addedBy ?: ""}",
                        color = WojoColors.TextSecondary,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(RoundedCornerShape(50))
                        .background(if (isPlaying) WojoColors.Success else WojoColors.TextSecondary)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (isPlaying) "Playing" else if (hasSong) "Paused" else "Ready",
                    color = WojoColors.TextSecondary,
                    fontSize = 11.sp
                )
                if (!role.isNullOrBlank()) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = roleColor(role).copy(alpha = 0.18f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, roleColor(role))
                    ) {
                        Text(
                            role,
                            color = roleColor(role),
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // ── Transport controls (visible to everyone; enabled for controllers) ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onPrev, enabled = canControl && hasSong) {
                Text("⏮", fontSize = 22.sp, color = if (canControl && hasSong) WojoColors.TextPrimary else WojoColors.TextSecondary)
            }
            Spacer(modifier = Modifier.width(16.dp))
            IconButton(onClick = { if (isPlaying) onPause() else onPlay() }, enabled = canControl && hasSong) {
                Text(
                    if (isPlaying) "⏸" else "▶️",
                    fontSize = 26.sp,
                    color = if (canControl && hasSong) WojoColors.Accent else WojoColors.TextSecondary
                )
            }
            Spacer(modifier = Modifier.width(16.dp))
            IconButton(onClick = onNext, enabled = canControl && hasSong) {
                Text("⏭", fontSize = 22.sp, color = if (canControl && hasSong) WojoColors.TextPrimary else WojoColors.TextSecondary)
            }
        }

        // ── Seek / progress ──
        Slider(
            value = sliderValue,
            onValueChange = {
                scrubbing = true
                scrubValue = it
            },
            onValueChangeFinished = {
                scrubbing = false
                if (canControl) onSeek(scrubValue)
            },
            valueRange = 0f..(if (maxDuration > 0f) maxDuration else 1f),
            enabled = canControl && maxDuration > 0f,
            colors = SliderDefaults.colors(
                thumbColor = WojoColors.Accent,
                activeTrackColor = WojoColors.Accent,
                inactiveTrackColor = WojoColors.DarkBackground,
                disabledThumbColor = WojoColors.TextSecondary,
                disabledActiveTrackColor = WojoColors.TextSecondary,
                disabledInactiveTrackColor = WojoColors.DarkBackground
            )
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(formatTime(shownPosition), color = WojoColors.TextSecondary, fontSize = 10.sp)
            Text(formatTime(duration), color = WojoColors.TextSecondary, fontSize = 10.sp)
        }
    }
}

private fun roleColor(role: String) = when (role) {
    "admin" -> WojoColors.Accent
    "moderator" -> WojoColors.Success
    else -> WojoColors.TextSecondary
}
