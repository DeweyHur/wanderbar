package app.wanderbar.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Pine = Color(0xFF1F3A34)
private val PineLight = Color(0xFF9CCFC0)
private val Amber = Color(0xFFF2C14E)
private val Paper = Color(0xFFF7F4EC)
private val Ink = Color(0xFF1B1C1A)

private val LightColors = lightColorScheme(
    primary = Pine,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFCDE8DF),
    onPrimaryContainer = Color(0xFF0B201B),
    secondary = Color(0xFF7A5A00),
    secondaryContainer = Amber,
    onSecondaryContainer = Color(0xFF261A00),
    background = Paper,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = Color(0xFFE6E2D6),
    error = Color(0xFFB3261E),
    errorContainer = Color(0xFFF9DEDC),
)

private val DarkColors = darkColorScheme(
    primary = PineLight,
    onPrimary = Color(0xFF00382E),
    primaryContainer = Color(0xFF1F4D43),
    onPrimaryContainer = Color(0xFFCDE8DF),
    secondary = Amber,
    secondaryContainer = Color(0xFF5C4300),
    onSecondaryContainer = Color(0xFFFFDF9E),
    background = Color(0xFF121412),
    surface = Color(0xFF121412),
    surfaceVariant = Color(0xFF2A2D2A),
)

@Composable
fun WanderbarTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
