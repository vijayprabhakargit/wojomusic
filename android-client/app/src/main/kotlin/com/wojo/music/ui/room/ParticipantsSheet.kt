package com.wojo.music.ui.room

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wojo.music.WojoColors
import com.wojo.music.protocol.Participant

@Composable
fun ParticipantsSheet(
    participants: List<Participant>,
    myInfo: Participant?,
    onDismiss: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxHeight(0.6f)
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
                "👥 People (${participants.size})",
                color = WojoColors.TextPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
            TextButton(onClick = onDismiss) {
                Text("✕", color = WojoColors.TextSecondary, fontSize = 16.sp)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        participants.forEach { participant ->
            ParticipantItem(
                participant = participant,
                isMe = myInfo?.name == participant.name
            )
        }
    }
}

@Composable
private fun ParticipantItem(
    participant: Participant,
    isMe: Boolean
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(6.dp),
        color = if (isMe) WojoColors.Accent.copy(alpha = 0.1f)
                else WojoColors.DarkBackground.copy(alpha = 0.3f)
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Avatar
            Surface(
                modifier = Modifier.size(36.dp),
                shape = CircleShape,
                color = when (participant.role) {
                    "admin" -> WojoColors.Accent.copy(alpha = 0.8f)
                    "moderator" -> androidx.compose.ui.graphics.Color(0xFF42A5F5)
                    else -> WojoColors.TextSecondary.copy(alpha = 0.5f)
                }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = (participant.avatarInitial ?: participant.name.firstOrNull()?.uppercase() ?: "?"),
                        color = WojoColors.DarkBackground,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )
                }
            }

            Spacer(modifier = Modifier.width(10.dp))

            // Name
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        participant.name,
                        color = WojoColors.TextPrimary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium
                    )
                    if (isMe) {
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            "(you)",
                            color = WojoColors.Accent,
                            fontSize = 11.sp
                        )
                    }
                }
            }

            // Role badge
            Surface(
                shape = RoundedCornerShape(4.dp),
                color = when (participant.role) {
                    "admin" -> WojoColors.Accent.copy(alpha = 0.3f)
                    "moderator" -> androidx.compose.ui.graphics.Color(0xFF42A5F5).copy(alpha = 0.3f)
                    else -> WojoColors.TextSecondary.copy(alpha = 0.2f)
                }
            ) {
                Text(
                    participant.role.replaceFirstChar { it.uppercase() },
                    color = when (participant.role) {
                        "admin" -> WojoColors.Accent
                        "moderator" -> androidx.compose.ui.graphics.Color(0xFF42A5F5)
                        else -> WojoColors.TextSecondary
                    },
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                )
            }
        }
    }
}