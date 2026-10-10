package com.wojo.music

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.wojo.music.protocol.ConnectionState
import com.wojo.music.protocol.SessionStore
import com.wojo.music.protocol.SocketClient
import com.wojo.music.service.MusicService
import com.wojo.music.ui.landing.LandingScreen
import com.wojo.music.ui.room.RoomScreen
import com.wojo.music.ui.room.RoomViewModel
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var socket: SocketClient
    @Inject lateinit var sessionStore: SessionStore

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        requestNotificationPermissionIfNeeded()

        // Start the media session service so playback (and its notification)
        // is wired to the shared ExoPlayer singleton and survives the Activity.
        try {
            startService(Intent(this, MusicService::class.java))
        } catch (e: Exception) {
            Log.w("MainActivity", "Could not start MusicService: ${e.message}")
        }

        // Own the socket at the app level so it isn't tied to the landing screen.
        socket.connect()

        // Restore a previous room so returning from the background keeps you in it.
        val saved = sessionStore.load()

        setContent {
            MaterialTheme(colorScheme = WojoColors.darkColorScheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()

                    LaunchedEffect(Unit) {
                        if (saved != null) {
                            socket.connectionState.first { it == ConnectionState.CONNECTED }
                            if (socket.roomId.value == null) {
                                socket.joinRoom(saved.roomId, saved.name, saved.role) { result ->
                                    if (!result.success) {
                                        sessionStore.clear()
                                        launch {
                                            navController.navigate("landing") {
                                                popUpTo("room") { inclusive = true }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    NavHost(
                        navController = navController,
                        startDestination = if (saved != null) "room" else "landing",
                        // Keep content clear of the status bar (top) and the
                        // navigation / home buttons (bottom) while still letting
                        // the dark background paint behind them.
                        modifier = Modifier
                            .fillMaxSize()
                            .windowInsetsPadding(WindowInsets.safeDrawing)
                    ) {
                        composable("landing") {
                            LandingScreen(
                                onRoomJoined = {
                                    navController.navigate("room") {
                                        popUpTo("landing") { inclusive = false }
                                        launchSingleTop = true
                                    }
                                }
                            )
                        }
                        composable("room") {
                            val viewModel: RoomViewModel = hiltViewModel()
                            RoomScreen(
                                viewModel = viewModel,
                                onLeave = {
                                    viewModel.leaveRoom()
                                    sessionStore.clear()
                                    navController.popBackStack("landing", inclusive = false)
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}
