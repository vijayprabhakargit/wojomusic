package com.wojo.music

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color

object WojoColors {
    val DarkBackground = Color(0xFF1A1A1A)
    val DarkSurface = Color(0xFF2A2A2A)
    val Accent = Color(0xFFC0A060)
    val AccentDim = Color(0xFF8B7A40)
    val TextPrimary = Color(0xFFE8E0D0)
    val TextSecondary = Color(0xFFA09880)
    val Danger = Color(0xFFFF5252)
    val Success = Color(0xFF66BB6A)

    val darkColorScheme = darkColorScheme(
        primary = Accent,
        secondary = AccentDim,
        background = DarkBackground,
        surface = DarkSurface,
        onPrimary = DarkBackground,
        onSecondary = DarkBackground,
        onBackground = TextPrimary,
        onSurface = TextPrimary,
        error = Danger
    )
}