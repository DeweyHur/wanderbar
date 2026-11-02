package app.wanderbar.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import app.wanderbar.domain.HoursStatus
import app.wanderbar.domain.PlaceStatus
import kotlinx.coroutines.delay
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter

private val HM_FORMAT = DateTimeFormatter.ofPattern("HH:mm")
fun LocalTime.hm(): String = format(HM_FORMAT)

/** Current time, refreshed every 30 seconds so open/closed labels stay honest. */
@Composable
fun rememberNow(): State<LocalDateTime> = produceState(LocalDateTime.now()) {
    while (true) {
        delay(30_000)
        value = LocalDateTime.now()
    }
}

fun HoursStatus.label(): String? = when (this) {
    is HoursStatus.Open -> closesAt?.let { "영업 중 · ${it.hm()}까지" } ?: "24시간 영업"
    is HoursStatus.ClosingSoon -> "곧 닫힘 · ${minutesLeft}분 남음"
    is HoursStatus.Closed -> opensAt?.let { "닫힘 · ${it.hm()}에 열림" } ?: "오늘은 닫힘"
    HoursStatus.Unknown -> null
}

@Composable
fun HoursChip(status: HoursStatus, modifier: Modifier = Modifier) {
    val text = status.label() ?: return
    val (bg, fg) = when (status) {
        is HoursStatus.Open -> Color(0xFFD6EFD8) to Color(0xFF1B5E20)
        is HoursStatus.ClosingSoon -> Color(0xFFFFE6B3) to Color(0xFF6D4C00)
        is HoursStatus.Closed -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.error
        HoursStatus.Unknown -> return
    }
    Box(
        modifier
            .background(bg, RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 3.dp),
    ) {
        Text(text, color = fg, style = MaterialTheme.typography.labelMedium)
    }
}

fun PlaceStatus.label(): String = when (this) {
    PlaceStatus.PENDING -> "예정"
    PlaceStatus.CURRENT -> "진행 중"
    PlaceStatus.DONE -> "완료"
    PlaceStatus.SKIPPED -> "안 가기로 함"
}
