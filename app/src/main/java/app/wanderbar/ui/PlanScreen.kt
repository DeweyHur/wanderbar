package app.wanderbar.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wanderbar.data.PlaceEntity
import app.wanderbar.data.Repository
import app.wanderbar.data.status
import app.wanderbar.domain.Hours
import app.wanderbar.domain.HoursStatus
import app.wanderbar.domain.Links
import app.wanderbar.domain.PlaceStatus
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState
import java.time.LocalDateTime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanScreen(
    repository: Repository,
    planId: Long,
    onBack: () -> Unit,
    onOpenPlace: (Long) -> Unit,
    onAddDetailed: () -> Unit,
) {
    val plan by remember(planId) { repository.observePlan(planId) }.collectAsStateWithLifecycle(initialValue = null)
    val places by remember(planId) { repository.observePlaces(planId) }.collectAsStateWithLifecycle(initialValue = null)
    val now by rememberNow()
    val context = LocalContext.current

    var menuOpen by remember { mutableStateOf(false) }
    var renameOpen by rememberSaveable { mutableStateOf(false) }
    var deleteOpen by rememberSaveable { mutableStateOf(false) }
    var quick by rememberSaveable { mutableStateOf("") }

    // Local copy so drag-and-drop feels instant; persisted when the drag ends.
    var order by remember { mutableStateOf<List<PlaceEntity>>(emptyList()) }
    var dragging by remember { mutableStateOf(false) }
    LaunchedEffect(places) { if (!dragging) places?.let { order = it } }

    val listState = rememberLazyListState()
    val reorderState = rememberReorderableLazyListState(listState) { from, to ->
        val fromIdx = order.indexOfFirst { it.id == from.key }
        val toIdx = order.indexOfFirst { it.id == to.key }
        if (fromIdx >= 0 && toIdx >= 0) {
            order = order.toMutableList().apply { add(toIdx, removeAt(fromIdx)) }
        }
    }

    fun submitQuick() {
        if (quick.isNotBlank()) {
            repository.addQuick(planId, quick)
            quick = ""
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(plan?.title ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로") }
                },
                actions = {
                    IconButton(onClick = { menuOpen = true }) { Icon(Icons.Default.MoreVert, contentDescription = "메뉴") }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(text = { Text("이름 바꾸기") }, onClick = { menuOpen = false; renameOpen = true })
                        DropdownMenuItem(text = { Text("처음부터 다시") }, onClick = { menuOpen = false; repository.restart(planId) })
                        DropdownMenuItem(text = { Text("플랜 삭제") }, onClick = { menuOpen = false; deleteOpen = true })
                    }
                },
            )
        },
        bottomBar = {
            Surface(tonalElevation = 3.dp) {
                Row(
                    Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = quick,
                        onValueChange = { quick = it },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        placeholder = { Text("카페, 공원, 저녁 재즈바") },
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { submitQuick() }),
                    )
                    IconButton(onClick = { submitQuick() }) { Icon(Icons.Default.Add, contentDescription = "쉼표로 여러 곳 추가") }
                    IconButton(onClick = onAddDetailed) { Icon(Icons.Default.EditNote, contentDescription = "자세히 추가") }
                }
            }
        },
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item(key = "hero") {
                val current = order.firstOrNull { it.status == PlaceStatus.CURRENT }
                when {
                    places == null -> Unit
                    current != null -> CurrentCard(
                        place = current,
                        now = now,
                        onOpen = { onOpenPlace(current.id) },
                        onTesla = { TeslaShare.send(context, current) },
                        onDirections = { openUrl(context, Links.googleDirections(current.name, current.address)) },
                        onYelp = { openUrl(context, Links.yelpSearch(current.name, current.address)) },
                        onDone = { repository.complete(planId, current.id) },
                        onSkip = { repository.postpone(planId, current.id) },
                    )
                    order.isEmpty() -> EmptyHint()
                    else -> FinishedCard(onRestart = { repository.restart(planId) })
                }
                Spacer(Modifier.height(8.dp))
            }
            items(order, key = { it.id }) { place ->
                ReorderableItem(reorderState, key = place.id) { isDragging ->
                    PlaceRow(
                        place = place,
                        number = order.indexOf(place) + 1,
                        now = now,
                        elevated = isDragging,
                        onClick = { onOpenPlace(place.id) },
                        handle = {
                            Icon(
                                Icons.Default.DragHandle,
                                contentDescription = "순서 바꾸기",
                                modifier = Modifier
                                    .draggableHandle(
                                        onDragStarted = { dragging = true },
                                        onDragStopped = {
                                            dragging = false
                                            repository.reorder(planId, order.map { it.id })
                                        },
                                    )
                                    .padding(8.dp),
                            )
                        },
                    )
                }
            }
        }
    }

    if (renameOpen) {
        var title by rememberSaveable { mutableStateOf(plan?.title.orEmpty()) }
        AlertDialog(
            onDismissRequest = { renameOpen = false },
            title = { Text("이름 바꾸기") },
            text = { OutlinedTextField(value = title, onValueChange = { title = it }, singleLine = true) },
            confirmButton = {
                TextButton(onClick = {
                    if (title.isNotBlank()) repository.renamePlan(planId, title)
                    renameOpen = false
                }) { Text("저장") }
            },
            dismissButton = { TextButton(onClick = { renameOpen = false }) { Text("취소") } },
        )
    }
    if (deleteOpen) {
        AlertDialog(
            onDismissRequest = { deleteOpen = false },
            title = { Text("플랜 삭제") },
            text = { Text("이 플랜과 모든 장소를 삭제할까요?") },
            confirmButton = {
                TextButton(onClick = {
                    deleteOpen = false
                    repository.deletePlan(planId)
                    onBack()
                }) { Text("삭제") }
            },
            dismissButton = { TextButton(onClick = { deleteOpen = false }) { Text("취소") } },
        )
    }
}

@Composable
private fun CurrentCard(
    place: PlaceEntity,
    now: LocalDateTime,
    onOpen: () -> Unit,
    onTesla: () -> Unit,
    onDirections: () -> Unit,
    onYelp: () -> Unit,
    onDone: () -> Unit,
    onSkip: () -> Unit,
) {
    val hours = Hours.status(place.hoursRaw, now)
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("지금 목적지", style = MaterialTheme.typography.labelLarge)
            Text(
                place.name,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(onClick = onOpen),
            )
            if (place.address.isNotBlank()) {
                Text(place.address, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (place.memo.isNotBlank()) {
                Text(place.memo, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (hours !is HoursStatus.Unknown) {
                Spacer(Modifier.height(8.dp))
                HoursChip(hours)
            }
            if (hours is HoursStatus.Closed || hours is HoursStatus.ClosingSoon) {
                Spacer(Modifier.height(8.dp))
                ClosedWarning(hours, onSkip)
            }
            Spacer(Modifier.height(12.dp))
            Button(onClick = onTesla, modifier = Modifier.fillMaxWidth().height(56.dp)) {
                Icon(Icons.Default.DirectionsCar, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("테슬라로 보내기", style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onDirections, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.Directions, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("길찾기")
                }
                OutlinedButton(onClick = onYelp, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.Star, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("옐프")
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = onDone, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("완료")
                }
                FilledTonalButton(onClick = onSkip, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.SkipNext, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("건너뛰기")
                }
            }
        }
    }
}

@Composable
private fun ClosedWarning(hours: HoursStatus, onSkip: () -> Unit) {
    val text = if (hours is HoursStatus.Closed) "지금 닫혀 있어요. 다음 장소로 넘길까요?" else "곧 닫혀요. 서두르거나 미뤄 두세요."
    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.medium) {
        Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.weight(1f))
            TextButton(onClick = onSkip) { Text("다음으로") }
        }
    }
}

@Composable
private fun EmptyHint() {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("장소를 추가해 보세요", style = MaterialTheme.typography.titleMedium)
            Text(
                "아래 칸에 쉼표로 여러 곳을 한 번에 넣거나, 구글맵에서 장소를 공유해 wanderbar로 보내세요.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun FinishedCard(onRestart: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("오늘 동선 끝!", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            TextButton(onClick = onRestart) {
                Icon(Icons.Default.Replay, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("처음부터")
            }
        }
    }
}

@Composable
private fun PlaceRow(
    place: PlaceEntity,
    number: Int,
    now: LocalDateTime,
    elevated: Boolean,
    onClick: () -> Unit,
    handle: @Composable () -> Unit,
) {
    val finished = place.status == PlaceStatus.DONE || place.status == PlaceStatus.SKIPPED
    val isCurrent = place.status == PlaceStatus.CURRENT
    Card(
        modifier = Modifier.fillMaxWidth().alpha(if (finished) 0.5f else 1f).clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = if (elevated) 8.dp else 0.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isCurrent) MaterialTheme.colorScheme.secondaryContainer
            else MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Row(Modifier.padding(start = 12.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(
                shape = CircleShape,
                color = if (isCurrent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                modifier = Modifier.size(28.dp),
            ) {
                Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    if (place.status == PlaceStatus.DONE) {
                        Icon(Icons.Default.Check, contentDescription = "완료", modifier = Modifier.size(16.dp))
                    } else {
                        Text(
                            "$number",
                            style = MaterialTheme.typography.labelMedium,
                            color = if (isCurrent) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    place.name,
                    style = MaterialTheme.typography.titleMedium,
                    textDecoration = if (finished) TextDecoration.LineThrough else null,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                val sub = listOfNotNull(
                    place.address.takeIf { it.isNotBlank() },
                    if (place.status == PlaceStatus.SKIPPED) PlaceStatus.SKIPPED.label() else null,
                ).joinToString(" · ")
                if (sub.isNotEmpty()) {
                    Text(sub, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (!finished) {
                    val hours = Hours.status(place.hoursRaw, now)
                    if (hours !is HoursStatus.Unknown) {
                        Spacer(Modifier.height(4.dp))
                        HoursChip(hours)
                    }
                }
            }
            handle()
        }
    }
}
