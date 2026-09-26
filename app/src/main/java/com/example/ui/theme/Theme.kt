package com.example.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = MiOrange,
    onPrimary = Color.White,
    primaryContainer = MiOrangeDark,
    onPrimaryContainer = Color.White,
    secondary = TechCyan,
    onSecondary = Color.Black,
    secondaryContainer = TechCyanDark,
    onSecondaryContainer = Color.White,
    background = TechDarkBg,
    onBackground = TextPrimary,
    surface = TechDarkSurface,
    onSurface = TextPrimary,
    surfaceVariant = TechDarkSurfaceVariant,
    onSurfaceVariant = TextSecondary,
    outline = TechDarkBorder,
    error = StatusRejected,
    onError = Color.White
)

private val LightColorScheme = lightColorScheme(
    primary = MiOrange,
    onPrimary = Color.White,
    primaryContainer = MiOrangeLight,
    onPrimaryContainer = Color.Black,
    secondary = TechCyanDark,
    onSecondary = Color.White,
    background = Color(0xFFF9FAFB),
    onBackground = Color(0xFF111827),
    surface = Color.White,
    onSurface = Color(0xFF111827),
    surfaceVariant = Color(0xFFF3F4F6),
    onSurfaceVariant = Color(0xFF4B5563),
    outline = Color(0xFFE5E7EB),
    error = StatusRejected,
    onError = Color.White
)

@Composable
fun MyApplicationTheme(
    darkTheme: Boolean = true, // Default to sleek tech dark theme for MI Unlock
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
