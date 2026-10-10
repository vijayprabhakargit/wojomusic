package com.wojo.music.protocol

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persists the current room membership so the app can restore (and re-join)
 * the room after being backgrounded or recreated, instead of dropping the user
 * back to the landing screen while audio keeps playing.
 */
@Singleton
class SessionStore @Inject constructor(@ApplicationContext context: Context) {

    private val prefs = context.getSharedPreferences("wojo_session", Context.MODE_PRIVATE)

    data class Session(val roomId: String, val name: String, val role: String)

    fun save(roomId: String, name: String, role: String) {
        prefs.edit()
            .putString("roomId", roomId)
            .putString("name", name)
            .putString("role", role)
            .apply()
    }

    fun load(): Session? {
        val roomId = prefs.getString("roomId", null) ?: return null
        val name = prefs.getString("name", null) ?: return null
        val role = prefs.getString("role", null) ?: "listener"
        return Session(roomId, name, role)
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
