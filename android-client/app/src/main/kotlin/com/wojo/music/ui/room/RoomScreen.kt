package com.wojo.music.ui.room

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
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
import com.wojo.music.ui.queue.QueueSheet
import com.wojo.music.ui.search.SearchSheet
import com.wojo.music.ui.sources.SourceSelectorSheet
import com.wojo.music.WojoColors

@Composable
fun RoomScreen(
    roomId: String,
    myName: String,
    myRole: String,
    viewModel: RoomViewModel,
    onLeave: () -> Unit
) {
    val playerState by viewModel.socket.playerState.collectAsState()
    val queue by viewModel.socket.queue.collectAsState()
    val participants by viewModel.socket.participants.collectAsState()
    val myInfo by viewModel.socket.myInfo.collectAsState()
    val isConnected by viewModel.socket.connectionState.collectAsState()
    val localPosition by viewModel.localPosition.collectAsState()
    val duration by viewModel.duration.collectAsState()
    val chatMessages by viewModel.socket.chatMessages.collectAsState()

    val canControl = viewModel.canControl
    val currentSong = playerState?.currentSong
    val currentIndex = playerState?.currentIndex ?: -1

    var showQueue by remember { mutableStateOf(false) }
    var showSearch by remember { mutableStateOf(false) }
    var showParticipants by remember { mutableStateOf(false) }
    var showChat by remember { mutableStateOf(true) }
    var showSourceSelector by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(12.dp)
            .background(WojoColors.DarkBackground)
    ) {
        // ── Top Bar ──
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(WojoColors.DarkSurface)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Wojo Music",
                    color = WojoColors.Accent,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                if (!isConnected.name.contains("CONNECTED")) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("⚠ Disconnected", color = WojoColors.Danger, fontSize = 12.sp)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Room: $roomId",
                    color = WojoColors.Accent,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.width(8.dp))
                Button(
                    onClick = onLeave,
                    colors = ButtonDefaults.buttonColors(containerColor = WojoColors.Danger),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                ) {
                    Text("Leave", fontSize = 12.sp)
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // ── Player Bar ──
        PlayerBar(
            currentSong = currentSong,
            localPosition = localPosition,
            duration = duration,
            isPlaying = playerState?.isPlaying ?: false,
            canControl = canControl,
            formatTime = viewModel::formatTime,
            onPlay = viewModel::play,
            onPause = viewModel::pause,
            onNext = viewModel::nextTrack,
            onPrev = viewModel::prevTrack
        )

        Spacer(modifier = Modifier.height(8.dp))

        // ── Queue Count Badges ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            BadgeButton("📋 Queue", queue.size.toString(), onClick = { showQueue = true })
            BadgeButton("🔍 Search", onClick = { showSearch = true })
            BadgeButton("👥 People", participants.size.toString(), onClick = { showParticipants = true })
        }

        Spacer(modifier = Modifier.height(8.dp))

        // ── Chat Area ──
        if (showChat) {
            ChatPanel(
                messages = chatMessages,
                myInfo = myInfo,
                onSend = viewModel.socket::sendMessage,
                modifier = Modifier.weight(1f)
            )
        }
    }

    // ── Bottom Sheets ──
    if (showQueue) {
        QueueSheet(
            queue = queue,
            currentIndex = currentIndex,
            canControl = canControl,
            formatTime = viewModel::formatTime,
            onRemove = viewModel::removeFromQueue,
            onReorder = viewModel::reorderQueue,
            onPlayFromQueue = viewModel::playFromQueue,
            onDismiss = { showQueue = false }
        )
    }

    if (showSearch) {
        SearchSheet(
            socket = viewModel.socket,
            onDismiss = { showSearch = false }
        )
    }

    if (showParticipants) {
        ParticipantsSheet(
            participants = participants,
            myInfo = myInfo,
            onDismiss = { showParticipants = false }
        )
    }

    if (showSourceSelector) {
        SourceSelectorSheet(
            socket = viewModel.socket,
            onDismiss = { showSourceSelector = false }
        )
    }
}

@Composable
private fun BadgeButton(
    label: String,
    badge: String? = null,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = WojoColors.DarkSurface),
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(vertical = 8.dp)
    ) {
        Text(label, fontSize = 12.sp)
        if (badge != null) {
            Spacer(modifier = Modifier.width(4.dp))
            Surface(
                shape = RoundedCornerShape(50),
                color = WojoColors.Accent
            ) {
                Text(
                    badge,
                    color = WojoColors.DarkBackground,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                )
            }
        }
    }
}