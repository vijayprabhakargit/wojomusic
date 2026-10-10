package com.wojo.music

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.wojo.music.service.MusicService
import com.wojo.music.ui.landing.LandingScreen
import com.wojo.music.ui.room.RoomScreen
import com.wojo.music.ui.room.RoomViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Start the media session service so playback (and the notification /
        // background playback) is wired to the shared ExoPlayer singleton.
        try {
            startService(Intent(this, MusicService::class.java))
        } catch (e: Exception) {
            Log.w("MainActivity", "Could not start MusicService: ${e.message}")
        }

        setContent {
            MaterialTheme(
                colorScheme = WojoColors.darkColorScheme
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()
                    NavHost(
                        navController = navController,
                        startDestination = "landing",
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
                                    navController.popBackStack("landing", inclusive = false)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
