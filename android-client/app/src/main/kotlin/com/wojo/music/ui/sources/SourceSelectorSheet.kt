package com.wojo.music.ui.sources

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wojo.music.WojoColors
import com.wojo.music.protocol.SocketClient
import com.wojo.music.protocol.Song
import kotlinx.coroutines.launch

private const val MAX_SIZE_MB = 30

@Composable
fun SourceSelectorSheet(
    socket: SocketClient,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf("local") }
    var status by remember { mutableStateOf<String?>(null) }
    var isError by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    var gdriveUrl by remember { mutableStateOf("") }
    var youtubeUrl by remember { mutableStateOf("") }

    fun showStatus(message: String, error: Boolean) {
        status = message
        isError = error
    }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        try {
            val contentResolver = context.contentResolver
            val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
                ?: return@rememberLauncherForActivityResult
            if (bytes.size > MAX_SIZE_MB * 1024 * 1024) {
                showStatus("File too large (max ${MAX_SIZE_MB}MB)", true)
                return@rememberLauncherForActivityResult
            }
            val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "audio_file"
            val mimeType = contentResolver.getType(uri) ?: "audio/mpeg"
            busy = true
            socket.uploadFile(bytes, fileName, mimeType) { result ->
                scope.launch {
                    if (result.success && result.file != null) {
                        val file = result.file
                        val title = fileName.substringBeforeLast('.').replace('_', ' ')
                        socket.addToQueue(
                            Song(
                                title = title,
                                url = file.publicUrl,
                                source = "local",
                                fileName = fileName,
                                fileType = mimeType,
                                duration = 0f
                            )
                        ) { addResult ->
                            scope.launch {
                                busy = false
                                if (addResult.success) {
                                    showStatus("\"$fileName\" added to queue!", false)
                                } else {
                                    showStatus(addResult.error ?: "Failed to add to queue", true)
                                }
                            }
                        }
                    } else {
                        busy = false
                        showStatus(result.error ?: "Upload failed", true)
                    }
                }
            }
        } catch (e: Exception) {
            busy = false
            showStatus(e.message ?: "Failed to read file", true)
        }
    }

    fun addGDrive() {
        val url = gdriveUrl.trim()
        if (url.isEmpty()) {
            showStatus("Please paste a Google Drive share link", true)
            return
        }
        if (!url.contains("drive.google.com")) {
            showStatus("This does not look like a Google Drive link.", true)
            return
        }
        val fileId = Regex("/file/d/([a-zA-Z0-9_-]+)").find(url)?.groupValues?.get(1)
            ?: Regex("[?&]id=([a-zA-Z0-9_-]+)").find(url)?.groupValues?.get(1)
        if (fileId == null) {
            showStatus("Could not find a file ID in that link.", true)
            return
        }
        val titleGuess = url.substringAfterLast('/').substringBefore('?')
            .replace('_', ' ').replace("%20", " ")
            .ifBlank { "Drive File ${fileId.take(6)}" }
        busy = true
        socket.addToQueue(
            Song(
                title = titleGuess,
                url = "https://drive.google.com/uc?export=download&id=$fileId",
                source = "gdrive"
            )
        ) { result ->
            scope.launch {
                busy = false
                if (result.success) {
                    gdriveUrl = ""
                    showStatus("Song added! It will download when it reaches the top of the queue.", false)
                } else {
                    showStatus(result.error ?: "Failed to add Google Drive song", true)
                }
            }
        }
    }

    fun addYoutube() {
        val url = youtubeUrl.trim()
        if (url.isEmpty()) {
            showStatus("Please paste a YouTube link", true)
            return
        }
        busy = true
        socket.addYoutube(url) { result ->
            scope.launch {
                busy = false
                if (result.success) {
                    youtubeUrl = ""
                    showStatus("Song added to queue!", false)
                } else {
                    showStatus(result.error ?: "Failed to add YouTube song", true)
                }
            }
        }
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
                "📀 Add Music",
                color = WojoColors.Accent,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
            TextButton(onClick = onDismiss) {
                Text("✕", color = WojoColors.TextSecondary, fontSize = 18.sp)
            }
        }

        // Tabs
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            SourceTab("📂 Device", tab == "local", Modifier.weight(1f)) { tab = "local"; status = null }
            SourceTab("🌐 Drive", tab == "gdrive", Modifier.weight(1f)) { tab = "gdrive"; status = null }
            SourceTab("🎬 YouTube", tab == "youtube", Modifier.weight(1f)) { tab = "youtube"; status = null }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            when (tab) {
                "local" -> {
                    Text(
                        "Select audio files from your device to share with the room. Files are uploaded to the server and streamed to everyone.",
                        color = WojoColors.TextSecondary,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(enabled = !busy) { filePickerLauncher.launch(arrayOf("audio/*")) },
                        shape = RoundedCornerShape(8.dp),
                        color = WojoColors.DarkBackground.copy(alpha = 0.5f),
                        border = BorderStroke(2.dp, WojoColors.TextSecondary.copy(alpha = 0.5f))
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(30.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text("🎵", fontSize = 36.sp)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Tap to browse", color = WojoColors.Accent, fontSize = 14.sp)
                            Text(
                                "Max ${MAX_SIZE_MB}MB · MP3, WAV, OGG, FLAC, AAC, M4A",
                                color = WojoColors.TextSecondary,
                                fontSize = 11.sp,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }

                "gdrive" -> {
                    Text(
                        "Paste a public Google Drive file link. The song will be downloaded to the server when it's next in the queue.",
                        color = WojoColors.TextSecondary,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = gdriveUrl,
                        onValueChange = { gdriveUrl = it },
                        placeholder = { Text("https://drive.google.com/file/d/...", color = WojoColors.TextSecondary, fontSize = 13.sp) },
                        singleLine = true,
                        colors = selectorFieldColors(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "💡 Make sure the file is shared as \"Anyone with the link\" and is an audio file.",
                        color = WojoColors.TextSecondary,
                        fontSize = 11.sp,
                        fontStyle = FontStyle.Italic
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = { addGDrive() },
                        enabled = !busy && gdriveUrl.isNotBlank(),
                        colors = ButtonDefaults.buttonColors(containerColor = WojoColors.Accent),
                        modifier = Modifier.fillMaxWidth().height(48.dp)
                    ) {
                        Text(if (busy) "Adding..." else "➕ Add to Queue", color = WojoColors.DarkBackground, fontWeight = FontWeight.Bold)
                    }
                }

                else -> {
                    Text(
                        "Paste a YouTube video link. The audio will be extracted and added to the queue. It will download when it reaches the top of the queue.",
                        color = WojoColors.TextSecondary,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = youtubeUrl,
                        onValueChange = { youtubeUrl = it },
                        placeholder = { Text("https://www.youtube.com/watch?v=...", color = WojoColors.TextSecondary, fontSize = 13.sp) },
                        singleLine = true,
                        colors = selectorFieldColors(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "🎬 Works with YouTube video links and Shorts. The song title will be fetched automatically.",
                        color = WojoColors.TextSecondary,
                        fontSize = 11.sp,
                        fontStyle = FontStyle.Italic
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = { addYoutube() },
                        enabled = !busy && youtubeUrl.isNotBlank(),
                        colors = ButtonDefaults.buttonColors(containerColor = WojoColors.Accent),
                        modifier = Modifier.fillMaxWidth().height(48.dp)
                    ) {
                        Text(if (busy) "Fetching info..." else "▶️ Add to Queue", color = WojoColors.DarkBackground, fontWeight = FontWeight.Bold)
                    }
                }
            }

            if (busy) {
                Spacer(modifier = Modifier.height(16.dp))
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = WojoColors.Accent)
                }
            }

            status?.let { message ->
                Spacer(modifier = Modifier.height(16.dp))
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = (if (isError) WojoColors.Danger else WojoColors.Success).copy(alpha = 0.15f),
                    border = BorderStroke(1.dp, if (isError) WojoColors.Danger else WojoColors.Success)
                ) {
                    Text(
                        if (isError) message else "✓ $message",
                        color = if (isError) WojoColors.Danger else WojoColors.Success,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(10.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun selectorFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = WojoColors.Accent,
    unfocusedBorderColor = WojoColors.TextSecondary,
    cursorColor = WojoColors.Accent,
    focusedTextColor = WojoColors.TextPrimary,
    unfocusedTextColor = WojoColors.TextPrimary
)

@Composable
private fun SourceTab(
    label: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier.clip(RoundedCornerShape(6.dp)).clickable { onClick() },
        shape = RoundedCornerShape(6.dp),
        color = if (selected) WojoColors.Accent.copy(alpha = 0.18f) else Color.Transparent,
        border = BorderStroke(
            1.dp,
            if (selected) WojoColors.Accent else WojoColors.TextSecondary.copy(alpha = 0.4f)
        )
    ) {
        Text(
            label,
            color = if (selected) WojoColors.Accent else WojoColors.TextSecondary,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp)
        )
    }
}
