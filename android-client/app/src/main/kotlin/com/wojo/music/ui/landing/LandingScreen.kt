package com.wojo.music.ui.landing

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.wojo.music.WojoColors
import com.wojo.music.protocol.SocketClient
import dagger.hilt.android.lifecycle.HiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LandingViewModel @Inject constructor(
    private val socket: SocketClient
) : ViewModel() {

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        socket.connect()
    }

    fun createRoom(name: String, role: String, onResult: (String) -> Unit) {
        _loading.value = true
        _error.value = null
        socket.createRoom(name, role) { result ->
            _loading.value = false
            if (result.success && result.roomId != null) {
                onResult(result.roomId)
            } else {
                _error.value = result.error ?: "Failed to create room"
            }
        }
    }

    fun joinRoom(roomId: String, name: String, role: String, onResult: () -> Unit) {
        _loading.value = true
        _error.value = null
        socket.joinRoom(roomId, name, role) { result ->
            _loading.value = false
            if (result.success) {
                onResult()
            } else {
                _error.value = result.error ?: "Failed to join room"
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        // Don't disconnect here — socket may still be used by RoomScreen
    }
}

@Composable
fun LandingScreen(
    onRoomJoined: (roomId: String, name: String, role: String) -> Unit
) {
    val viewModel: LandingViewModel = hiltViewModel()
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()

    var name by remember { mutableStateOf("") }
    var roomCode by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("listener") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Wojo Music",
            color = WojoColors.Accent,
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(32.dp))

        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Your Name") },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = WojoColors.Accent,
                unfocusedBorderColor = WojoColors.TextSecondary,
                focusedLabelColor = WojoColors.Accent,
                cursorColor = WojoColors.Accent
            ),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Words,
                imeAction = ImeAction.Next
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = roomCode,
            onValueChange = { roomCode = it.uppercase() },
            label = { Text("Room Code (optional for create)") },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = WojoColors.Accent,
                unfocusedBorderColor = WojoColors.TextSecondary,
                focusedLabelColor = WojoColors.Accent,
                cursorColor = WojoColors.Accent
            ),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                keyboardType = KeyboardType.Ascii,
                imeAction = ImeAction.Done
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Role selector
        Text("Role", color = WojoColors.TextSecondary, fontSize = 13.sp)
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf("listener", "moderator").forEach { r ->
                FilterChip(
                    selected = role == r,
                    onClick = { role = r },
                    label = { Text(r.replaceFirstChar { it.uppercase() }, fontSize = 13.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = WojoColors.Accent,
                        selectedLabelColor = WojoColors.DarkBackground
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (error != null) {
            Text(error!!, color = WojoColors.Danger, fontSize = 13.sp)
            Spacer(modifier = Modifier.height(8.dp))
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Button(
                onClick = {
                    if (name.isNotBlank()) {
                        viewModel.createRoom(name, role) { roomId ->
                            onRoomJoined(roomId, name, role)
                        }
                    }
                },
                enabled = !loading && name.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = WojoColors.Accent),
                modifier = Modifier.weight(1f)
            ) {
                Text("Create Room", color = WojoColors.DarkBackground)
            }

            Button(
                onClick = {
                    if (name.isNotBlank() && roomCode.isNotBlank()) {
                        viewModel.joinRoom(roomCode, name, role) {
                            onRoomJoined(roomCode, name, role)
                        }
                    }
                },
                enabled = !loading && name.isNotBlank() && roomCode.isNotBlank(),
                modifier = Modifier.weight(1f)
            ) {
                Text("Join Room")
            }
        }

        if (loading) {
            Spacer(modifier = Modifier.height(16.dp))
            CircularProgressIndicator(color = WojoColors.Accent)
        }
    }
}