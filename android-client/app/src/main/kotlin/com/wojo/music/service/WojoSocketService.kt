package com.wojo.music.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.wojo.music.protocol.SocketClient
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Android Service wrapper around SocketClient so it can outlive the Activity
 * and survive configuration changes. Exposes the socket as a singleton.
 */
@AndroidEntryPoint
class WojoSocketService : Service() {

    @Inject lateinit var socket: SocketClient

    override fun onCreate() {
        super.onCreate()
        socket.connect()
    }

    override fun onDestroy() {
        socket.disconnect()
        super.onDestroy()
    }

    override fun onBind(intent: Intent): IBinder? {
        return null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        return Service.START_NOT_STICKY
    }
}