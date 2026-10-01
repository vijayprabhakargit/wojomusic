package com.wojo.music.ui.sources

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wojo.music.WojoColors
import com.wojo.music.protocol.SocketClient

@Composable
fun SourceSelectorSheet(
    socket: SocketClient,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var localFileError by remember { mutableStateOf<String?>(null) }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult

        try {
            val contentResolver = context.contentResolver
            val inputStream = contentResolver.openInputStream(uri) ?: return@rememberLauncherForActivityResult
            val bytes = inputStream.readBytes()
            inputStream.close()

            // Check size (30MB limit)
            val maxBytes = 30 * 1024 * 1024
            if (bytes.size > maxBytes) {
                localFileError = "File too large (max 30MB)"
                return@rememberLauncherForActivityResult
            }

            val fileName = uri.lastPathSegment ?: "audio_file"
            val mimeType = contentResolver.getType(uri) ?: "audio/*"

            socket.uploadFile(bytes, fileName, mimeType) { result ->
                if (!result.success) {
                    localFileError = result.error ?: "Upload failed"
                }
            }
        } catch (e: Exception) {
            localFileError = e.message ?: "Failed to read file"
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 200.dp)
            .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
            .background(WojoColors.DarkSurface)
            .padding(16.dp)
    ) {
        Text(
            "Add Music",
            color = WojoColors.TextPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        // Local file
        Button(
            onClick = { filePickerLauncher.launch(arrayOf("audio/*")) },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = WojoColors.DarkBackground)
        ) {
            Text("📁 Add from device", color = WojoColors.TextPrimary)
        }

        Spacer(modifier = Modifier.height(8.dp))

        // YouTube URL
        Button(
            onClick = {
                // Open a dialog or sheet for YouTube URL input
                // For now, the SearchSheet handles YouTube search
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = WojoColors.DarkBackground)
        ) {
            Text("▶️ Add YouTube URL", color = WojoColors.TextPrimary)
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Google Drive
        Button(
            onClick = {
                // Open a sheet for GDrive URL input
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = WojoColors.DarkBackground)
        ) {
            Text("☁️ Add from Google Drive", color = WojoColors.TextPrimary)
        }

        if (localFileError != null) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(localFileError!!, color = WojoColors.Danger, fontSize = 12.sp)
        }
    }
}