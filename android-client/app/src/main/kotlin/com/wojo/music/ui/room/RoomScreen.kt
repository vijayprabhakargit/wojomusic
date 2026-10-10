package com.wojo.music.ui.room

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wojo.music.WojoColors
import com.wojo.music.protocol.ConnectionState
import com.wojo.music.ui.queue.QueueSheet
import com.wojo.music.ui.search.SearchSheet
import com.wojo.music.ui.sources.SourceSelectorSheet

@Composable
fun RoomScreen(
    viewModel: RoomViewModel,
    onLeave: () -> Unit
) {
    val playerState by viewModel.socket.playerState.collectAsState()
    val queue by viewModel.socket.queue.collectAsState()
    val participants by viewModel.socket.participants.collectAsState()
    val myInfo by viewModel.socket.myInfo.collectAsState()
    val roomId by viewModel.socket.roomId.collectAsState()
    val connectionState by viewModel.socket.connectionState.collectAsState()
    val localPosition by viewModel.localPosition.collectAsState()
    val duration by viewModel.duration.collectAsState()
    val chatMessages by viewModel.socket.chatMessages.collectAsState()

    val isConnected = connectionState == ConnectionState.CONNECTED
    val canControl = myInfo?.role == "admin" || myInfo?.role == "moderator"
    val currentSong = playerState?.currentSong
    val currentIndex = playerState?.currentIndex ?: -1

    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }

    // The bottom panel hosts either chat or one of the tool panels, all in the
    // same footprint (so Queue/Search/People/Add Song don't take over the whole
    // screen). Tapping the active badge again returns to chat.
    var activePanel by remember { mutableStateOf("chat") }
    fun togglePanel(panel: String) {
        activePanel = if (activePanel == panel) "chat" else panel
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(WojoColors.DarkBackground)
            .padding(12.dp)
    ) {
        // ── Top Bar ──
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(WojoColors.DarkSurface)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    "🐱 Wojo Music",
                    color = WojoColors.Accent,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold
                )
                if (!isConnected) {
                    Text("⚠ Disconnected", color = WojoColors.Danger, fontSize = 11.sp)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    roomId ?: "·····",
                    color = WojoColors.Accent,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 2.sp
                )
                Spacer(modifier = Modifier.width(6.dp))
                TextButton(
                    onClick = {
                        val code = roomId
                        if (!code.isNullOrBlank()) {
                            clipboard.setText(AnnotatedString(code))
                            copied = true
                        }
                    },
                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(if (copied) "✅" else "🔗", fontSize = 14.sp)
                }
                Spacer(modifier = Modifier.width(4.dp))
                Button(
                    onClick = onLeave,
                    colors = ButtonDefaults.buttonColors(containerColor = WojoColors.Danger),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                ) {
                    Text("✕ Leave", fontSize = 12.sp)
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

        // ── Add Song ──
        Button(
            onClick = { togglePanel("add") },
            colors = ButtonDefaults.buttonColors(
                containerColor = if (activePanel == "add") WojoColors.AccentDim else WojoColors.Accent
            ),
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(vertical = 10.dp)
        ) {
            Text(
                if (activePanel == "add") "✕ Close" else "➕ Add Song",
                color = WojoColors.DarkBackground,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        // ── Panel switch badges ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            BadgeButton(
                label = "📋 Queue",
                badge = queue.size.toString(),
                selected = activePanel == "queue",
                modifier = Modifier.weight(1f)
            ) { togglePanel("queue") }
            BadgeButton(
                label = "🔍 Search",
                badge = null,
                selected = activePanel == "search",
                modifier = Modifier.weight(1f)
            ) { togglePanel("search") }
            BadgeButton(
                label = "👥 People",
                badge = participants.size.toString(),
                selected = activePanel == "people",
                modifier = Modifier.weight(1f)
            ) { togglePanel("people") }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // ── Bottom panel (chat or the selected tool) ──
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when (activePanel) {
                "queue" -> QueueSheet(
                    queue = queue,
                    currentIndex = currentIndex,
                    canControl = canControl,
                    formatTime = viewModel::formatTime,
                    onRemove = viewModel::removeFromQueue,
                    onReorder = viewModel::reorderQueue,
                    onPlayFromQueue = viewModel::playFromQueue,
                    onDismiss = { activePanel = "chat" }
                )

                "search" -> SearchSheet(
                    onDismiss = { activePanel = "chat" }
                )

                "people" -> ParticipantsSheet(
                    participants = participants,
                    myInfo = myInfo,
                    onDismiss = { activePanel = "chat" }
                )

                "add" -> SourceSelectorSheet(
                    socket = viewModel.socket,
                    onDismiss = { activePanel = "chat" }
                )

                else -> ChatPanel(
                    messages = chatMessages,
                    myInfo = myInfo,
                    onSend = viewModel.socket::sendMessage,
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}

@Composable
private fun BadgeButton(
    label: String,
    badge: String?,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (selected) WojoColors.Accent.copy(alpha = 0.25f) else WojoColors.DarkSurface
        ),
        modifier = modifier,
        contentPadding = PaddingValues(vertical = 8.dp)
    ) {
        Text(label, fontSize = 12.sp, color = if (selected) WojoColors.Accent else WojoColors.TextPrimary)
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
