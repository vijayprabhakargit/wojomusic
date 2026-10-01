package com.wojo.music

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.wojo.music.ui.landing.LandingScreen
import com.wojo.music.ui.room.RoomScreen
import com.wojo.music.ui.room.RoomViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(
                colorScheme = WojoColors.darkColorScheme
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()
                    NavHost(navController = navController, startDestination = "landing") {
                        composable("landing") {
                            LandingScreen(
                                onRoomJoined = { roomId, myName, myRole ->
                                    navController.navigate("room/$roomId/$myName/$myRole") {
                                        popUpTo("landing") { inclusive = false }
                                    }
                                }
                            )
                        }
                        composable("room/{roomId}/{myName}/{myRole}") { backStackEntry ->
                            val roomId = backStackEntry.arguments?.getString("roomId") ?: ""
                            val myName = backStackEntry.arguments?.getString("myName") ?: ""
                            val myRole = backStackEntry.arguments?.getString("myRole") ?: "listener"
                            val viewModel: RoomViewModel = hiltViewModel()
                            RoomScreen(
                                roomId = roomId,
                                myName = myName,
                                myRole = myRole,
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