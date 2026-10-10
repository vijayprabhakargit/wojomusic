package com.wojo.music.ui.landing

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wojo.music.WojoColors
import com.wojo.music.protocol.ConnectionState
import com.wojo.music.protocol.SocketClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LandingViewModel @Inject constructor(
    val socket: SocketClient
) : ViewModel() {

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    // Emits the joined room id once a create/join succeeds. The screen observes
    // this and navigates on the main thread (socket callbacks run off-main).
    private val _joinedRoomId = MutableStateFlow<String?>(null)
    val joinedRoomId: StateFlow<String?> = _joinedRoomId.asStateFlow()

    init {
        socket.connect()

        // Timeout watcher: auto-clear loading after 20s to prevent infinite spinner
        viewModelScope.launch {
            while (isActive) {
                if (_loading.value) {
                    delay(20000)
                    if (_loading.value) {
                        _loading.value = false
                        _error.value = "Connection timed out. Check that the server is running and reachable."
                    }
                } else {
                    delay(1000)
                }
            }
        }
    }

    fun clearError() {
        _error.value = null
    }

    fun onValidationError(message: String) {
        _error.value = message
    }

    fun consumeNavigation() {
        _joinedRoomId.value = null
    }

    fun createRoom(name: String, role: String) {
        if (socket.connectionState.value != ConnectionState.CONNECTED) {
            _error.value = "Not connected to server. Please wait or check the server address."
            return
        }
        _loading.value = true
        _error.value = null
        socket.createRoom(name.trim(), role) { result ->
            _loading.value = false
            if (result.success && result.roomId != null) {
                _joinedRoomId.value = result.roomId
            } else {
                _error.value = result.error ?: "Failed to create room"
            }
        }
    }

    fun joinRoom(roomId: String, name: String, role: String) {
        if (socket.connectionState.value != ConnectionState.CONNECTED) {
            _error.value = "Not connected to server. Please wait or check the server address."
            return
        }
        _loading.value = true
        _error.value = null
        socket.joinRoom(roomId.trim(), name.trim(), role) { result ->
            _loading.value = false
            if (result.success) {
                _joinedRoomId.value = socket.roomId.value ?: roomId.trim().uppercase()
            } else {
                _error.value = result.error ?: "Failed to join room"
            }
        }
    }
}

@Composable
fun LandingScreen(
    onRoomJoined: () -> Unit
) {
    val viewModel: LandingViewModel = hiltViewModel()
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()
    val joinedRoomId by viewModel.joinedRoomId.collectAsState()
    val connectionState by viewModel.socket.connectionState.collectAsState()

    val isConnected = connectionState == ConnectionState.CONNECTED
    val keyboard = LocalSoftwareKeyboardController.current

    var tab by remember { mutableStateOf("create") } // "create" | "join"
    var name by remember { mutableStateOf("") }
    var createRole by remember { mutableStateOf("moderator") }
    var roomCode by remember { mutableStateOf("") }
    var joinRole by remember { mutableStateOf("listener") }

    // Navigate on the main thread when a room is created/joined.
    LaunchedEffect(joinedRoomId) {
        if (joinedRoomId != null) {
            keyboard?.hide()
            onRoomJoined()
            viewModel.consumeNavigation()
        }
    }

    fun attemptCreate() {
        if (name.isBlank()) {
            viewModel.clearError()
            // surface validation through the shared error field
            viewModel.onValidationError("Please enter your name")
            return
        }
        viewModel.createRoom(name, createRole)
    }

    fun attemptJoin() {
        if (name.isBlank()) {
            viewModel.onValidationError("Please enter your name")
            return
        }
        if (roomCode.isBlank()) {
            viewModel.onValidationError("Please enter a room ID")
            return
        }
        viewModel.joinRoom(roomCode, name, joinRole)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(WojoColors.DarkBackground),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // ── Header ──
            Text("🐱", fontSize = 40.sp)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "WOJO MUSIC",
                color = WojoColors.Accent,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp
            )
            Text(
                "Listen together. Real-time sync.",
                color = WojoColors.TextSecondary,
                fontSize = 13.sp
            )

            Spacer(modifier = Modifier.height(20.dp))

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = WojoColors.DarkSurface
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    // ── Connection status ──
                    if (!isConnected) {
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = WojoColors.Danger.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = if (connectionState == ConnectionState.ERROR)
                                    "⚠  Connection failed. Check the server address."
                                else "⚠  Connecting to server...",
                                color = WojoColors.Danger,
                                fontSize = 12.sp,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                textAlign = TextAlign.Center
                            )
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    // ── Tabs ──
                    Row(modifier = Modifier.fillMaxWidth()) {
                        TabButton(
                            selected = tab == "create",
                            label = "🎤 Create Room",
                            modifier = Modifier.weight(1f),
                            onClick = { tab = "create"; viewModel.clearError() }
                        )
                        TabButton(
                            selected = tab == "join",
                            label = "🎧 Join Room",
                            modifier = Modifier.weight(1f),
                            onClick = { tab = "join"; viewModel.clearError() }
                        )
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // ── Name (common) ──
                    Text(
                        "Your Name",
                        color = WojoColors.TextSecondary,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(bottom = 6.dp)
                    )
                    OutlinedTextField(
                        value = name,
                        onValueChange = { if (it.length <= 30) name = it },
                        placeholder = { Text("Enter your name...", color = WojoColors.TextSecondary) },
                        singleLine = true,
                        colors = wojoFieldColors(),
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Words,
                            imeAction = if (tab == "create") ImeAction.Done else ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = { if (tab == "create") attemptCreate() },
                            onNext = { keyboard?.hide() }
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    if (tab == "create") {
                        Text(
                            "Your Role",
                            color = WojoColors.TextSecondary,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(bottom = 6.dp)
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            RoleOption(
                                selected = createRole == "moderator",
                                title = "⚙ Moderator",
                                description = "Control playback & queue",
                                modifier = Modifier.weight(1f),
                                onClick = { createRole = "moderator" }
                            )
                            RoleOption(
                                selected = createRole == "listener",
                                title = "🎧 Listener",
                                description = "Only add songs & chat",
                                modifier = Modifier.weight(1f),
                                onClick = { createRole = "listener" }
                            )
                        }
                        Text(
                            "You'll be the admin since you're creating the room.",
                            color = WojoColors.TextSecondary,
                            fontSize = 11.sp,
                            fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                            modifier = Modifier.padding(top = 8.dp)
                        )

                        Spacer(modifier = Modifier.height(20.dp))

                        Button(
                            onClick = { attemptCreate() },
                            enabled = !loading && isConnected,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = WojoColors.Accent,
                                disabledContainerColor = WojoColors.AccentDim
                            ),
                            modifier = Modifier.fillMaxWidth().height(48.dp)
                        ) {
                            Text(
                                if (loading) "Creating Room..." else "🎵 Create Music Room",
                                color = WojoColors.DarkBackground,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    } else {
                        Text(
                            "Room ID",
                            color = WojoColors.TextSecondary,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(bottom = 6.dp)
                        )
                        OutlinedTextField(
                            value = roomCode,
                            onValueChange = { if (it.length <= 6) roomCode = it.uppercase() },
                            placeholder = { Text("e.g. ABC123", color = WojoColors.TextSecondary) },
                            singleLine = true,
                            colors = wojoFieldColors(),
                            keyboardOptions = KeyboardOptions(
                                capitalization = KeyboardCapitalization.Characters,
                                keyboardType = KeyboardType.Ascii,
                                imeAction = ImeAction.Done
                            ),
                            keyboardActions = KeyboardActions(onDone = { attemptJoin() }),
                            textStyle = androidx.compose.ui.text.TextStyle(
                                letterSpacing = 4.sp,
                                textAlign = TextAlign.Center,
                                fontSize = 20.sp,
                                color = WojoColors.TextPrimary
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        Text(
                            "Join as",
                            color = WojoColors.TextSecondary,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(bottom = 6.dp)
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            RoleOption(
                                selected = joinRole == "moderator",
                                title = "⚙ Moderator",
                                description = null,
                                modifier = Modifier.weight(1f),
                                onClick = { joinRole = "moderator" }
                            )
                            RoleOption(
                                selected = joinRole == "listener",
                                title = "🎧 Listener",
                                description = null,
                                modifier = Modifier.weight(1f),
                                onClick = { joinRole = "listener" }
                            )
                        }
                        Text(
                            "You can be a moderator (control playback) or a listener (just listen & chat).",
                            color = WojoColors.TextSecondary,
                            fontSize = 11.sp,
                            fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                            modifier = Modifier.padding(top = 8.dp)
                        )

                        Spacer(modifier = Modifier.height(20.dp))

                        Button(
                            onClick = { attemptJoin() },
                            enabled = !loading && isConnected,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = WojoColors.Accent,
                                disabledContainerColor = WojoColors.AccentDim
                            ),
                            modifier = Modifier.fillMaxWidth().height(48.dp)
                        ) {
                            Text(
                                if (loading) "Joining Room..." else "🎧 Join Room",
                                color = WojoColors.DarkBackground,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    if (loading) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = WojoColors.Accent)
                        }
                    }

                    // ── Error ──
                    if (error != null) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = WojoColors.Danger.copy(alpha = 0.15f),
                            border = BorderStroke(1.dp, WojoColors.Danger)
                        ) {
                            Text(
                                error!!,
                                color = WojoColors.Danger,
                                fontSize = 13.sp,
                                textAlign = TextAlign.Center,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(10.dp)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
            Text(
                "🐱 Wojo Music — listen together.",
                color = WojoColors.TextSecondary,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
private fun wojoFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = WojoColors.Accent,
    unfocusedBorderColor = WojoColors.TextSecondary,
    focusedLabelColor = WojoColors.Accent,
    cursorColor = WojoColors.Accent,
    focusedTextColor = WojoColors.TextPrimary,
    unfocusedTextColor = WojoColors.TextPrimary
)

@Composable
private fun TabButton(
    selected: Boolean,
    label: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
            .clickable { onClick() },
        color = if (selected) WojoColors.Accent.copy(alpha = 0.12f) else Color.Transparent
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                label,
                color = if (selected) WojoColors.Accent else WojoColors.TextSecondary,
                fontSize = 13.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(if (selected) WojoColors.Accent else WojoColors.TextSecondary.copy(alpha = 0.3f))
            )
        }
    }
}

@Composable
private fun RoleOption(
    selected: Boolean,
    title: String,
    description: String?,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .clickable { onClick() },
        shape = RoundedCornerShape(6.dp),
        color = if (selected) WojoColors.Accent.copy(alpha = 0.18f)
        else WojoColors.DarkBackground.copy(alpha = 0.4f),
        border = BorderStroke(
            1.dp,
            if (selected) WojoColors.Accent else WojoColors.TextSecondary.copy(alpha = 0.4f)
        )
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                title,
                color = if (selected) WojoColors.Accent else WojoColors.TextPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
            )
            if (description != null) {
                Text(
                    description,
                    color = WojoColors.TextSecondary,
                    fontSize = 10.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}
