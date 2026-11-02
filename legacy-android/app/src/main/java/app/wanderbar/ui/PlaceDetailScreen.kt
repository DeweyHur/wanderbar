package app.wanderbar.ui

import androidx.compose.foundation.layout.Arrangement
import app.wanderbar.domain.TeslaFormat
import app.wanderbar.data.PlaceEntity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.Alignment
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Card
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wanderbar.data.Repository
import app.wanderbar.data.status
import app.wanderbar.domain.Hours
import app.wanderbar.domain.Links
import app.wanderbar.domain.PlaceStatus

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceDetailScreen(
    repository: Repository,
    placeId: Long,
    onBack: () -> Unit,
    onEdit: (planId: Long, placeId: Long) -> Unit,
) {
    val placeOrNull by remember(placeId) { repository.observePlace(placeId) }.collectAsStateWithLifecycle(initialValue = null)
    var loaded by remember { mutableStateOf(false) }
    var deleteOpen by rememberSaveable { mutableStateOf(false) }
    val now by rememberNow()
    val context = LocalContext.current

    // Leave the screen if the place disappears (deleted) after it was shown.
    LaunchedEffect(placeOrNull) {
        if (placeOrNull != null) loaded = true else if (loaded) onBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("장소") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로") }
                },
                actions = {
                    placeOrNull?.let { p ->
                        IconButton(onClick = { onEdit(p.planId, p.id) }) { Icon(Icons.Default.Edit, contentDescription = "편집") }
                        IconButton(onClick = { deleteOpen = true }) { Icon(Icons.Default.Delete, contentDescription = "삭제") }
                    }
                },
            )
        },
    ) { padding ->
        val place = placeOrNull
        if (place != null) {
            val hours = Hours.status(place.hoursRaw, now)
            Column(
                Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(place.status.label(), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text(place.name, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                if (place.address.isNotBlank()) Text(place.address, style = MaterialTheme.typography.bodyLarge)
                HoursChip(hours)
                if (place.lat != null && place.lng != null) {
                    PlaceMiniMap(place.lat, place.lng, place.name)
                }
                if (place.hoursRaw.isNotBlank()) {
                    Text("영업시간: ${place.hoursRaw}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (place.memo.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(place.memo, style = MaterialTheme.typography.bodyMedium)
                }

                Spacer(Modifier.height(8.dp))
                Button(onClick = { TeslaShare.send(context, place) }, modifier = Modifier.fillMaxWidth().height(56.dp)) {
                    Icon(Icons.Default.DirectionsCar, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("테슬라로 보내기", style = MaterialTheme.typography.titleMedium)
                }
                LinkButton(Icons.Default.Share, "다른 앱으로 공유") { TeslaShare.shareAnywhere(context, TeslaShare.shareText(context, place)) }
                LinkButton(Icons.Default.Directions, "구글맵 길찾기") {
                    openUrl(context, Links.googleDirections(place.name, place.address))
                }
                LinkButton(Icons.Default.Map, "구글맵에서 보기") {
                    openUrl(context, place.mapsUrl.ifBlank { Links.googleSearch(place.name, place.address) })
                }
                LinkButton(Icons.Default.Star, "옐프에서 찾기") {
                    openUrl(context, Links.yelpSearch(place.name, place.address))
                }

                Spacer(Modifier.height(8.dp))
                HorizontalDivider()
                Spacer(Modifier.height(4.dp))
                val planId = place.planId
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    when (place.status) {
                        PlaceStatus.CURRENT -> {
                            FilledTonalButton(onClick = { repository.complete(planId, place.id) }, Modifier.weight(1f)) { Text("완료") }
                            FilledTonalButton(onClick = { repository.postpone(planId, place.id) }, Modifier.weight(1f)) { Text("건너뛰기") }
                        }
                        PlaceStatus.PENDING -> {
                            FilledTonalButton(onClick = { repository.setCurrent(planId, place.id) }, Modifier.weight(1f)) { Text("지금 여기로") }
                        }
                        PlaceStatus.DONE, PlaceStatus.SKIPPED -> {
                            FilledTonalButton(onClick = { repository.restore(planId, place.id) }, Modifier.weight(1f)) { Text("되돌리기") }
                            FilledTonalButton(onClick = { repository.setCurrent(planId, place.id) }, Modifier.weight(1f)) { Text("지금 여기로") }
                        }
                    }
                }
                if (place.status == PlaceStatus.PENDING || place.status == PlaceStatus.CURRENT) {
                    TextButton(onClick = { repository.drop(planId, place.id) }) { Text("이번엔 안 가기") }
                }

                Spacer(Modifier.height(16.dp))
                TeslaFormatTester(place)
            }
        }
    }

    if (deleteOpen) {
        val p = placeOrNull
        AlertDialog(
            onDismissRequest = { deleteOpen = false },
            title = { Text("장소 삭제") },
            text = { Text("\"${p?.name.orEmpty()}\"을(를) 플랜에서 지울까요?") },
            confirmButton = {
                TextButton(onClick = {
                    deleteOpen = false
                    // The LaunchedEffect above navigates back once the row is gone.
                    if (p != null) repository.deletePlace(p.planId, p.id) else onBack()
                }) { Text("삭제") }
            },
            dismissButton = { TextButton(onClick = { deleteOpen = false }) { Text("취소") } },
        )
    }
}

@Composable
private fun LinkButton(icon: ImageVector, text: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, modifier = Modifier.weight(1f))
    }
}


/**
 * Send the same place in each format and keep the one the Tesla app accepts as the default.
 * Used for M3 verification on the car.
 */
@Composable
private fun TeslaFormatTester(place: PlaceEntity) {
    val context = LocalContext.current
    var preferred by remember { mutableStateOf(TeslaShare.preferredFormat(context)) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("테슬라 전송 형식 테스트", style = MaterialTheme.typography.titleSmall)
            Text(
                "각각 보내 보고, 차에 목적지가 뜨는 형식을 기본으로 고르세요.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TeslaFormat.entries.forEach { format ->
                val text = TeslaShare.shareText(place, format)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = preferred == format,
                        onClick = {
                            preferred = format
                            TeslaShare.setPreferredFormat(context, format)
                        },
                        enabled = text != null,
                    )
                    Column(Modifier.weight(1f)) {
                        Text(format.label, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            text ?: "이 장소엔 없음",
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    TextButton(onClick = { text?.let { TeslaShare.sendText(context, it) } }, enabled = text != null) {
                        Text("보내기")
                    }
                }
            }
        }
    }
}
