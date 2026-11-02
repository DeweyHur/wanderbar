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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wanderbar.data.PlanSummary
import app.wanderbar.data.Repository
import app.wanderbar.domain.SharedPlace
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val dateFmt = DateTimeFormatter.ofPattern("M월 d일 (E)")

fun defaultPlanTitle(): String = "${LocalDate.now().format(DateTimeFormatter.ofPattern("M월 d일"))} 동선"

/**
 * Lists day plans. When [pendingShare] is set, the user is picking which plan
 * receives a place shared in from Google Maps.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlansScreen(
    repository: Repository,
    pendingShare: SharedPlace?,
    onCancelShare: () -> Unit,
    onOpenPlan: (Long) -> Unit,
) {
    val plans by remember { repository.observePlanSummaries() }.collectAsStateWithLifecycle(initialValue = null)
    var showCreate by rememberSaveable { mutableStateOf(false) }
    var toDelete by remember { mutableStateOf<PlanSummary?>(null) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("wanderbar", fontWeight = FontWeight.Bold) }) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showCreate = true },
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("새 플랜") },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 96.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (pendingShare != null) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("공유받은 장소", style = MaterialTheme.typography.labelLarge)
                                Text(
                                    pendingShare.name.ifBlank { pendingShare.mapsUrl ?: "" },
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text("추가할 플랜을 고르세요", style = MaterialTheme.typography.bodySmall)
                            }
                            IconButton(onClick = onCancelShare) { Icon(Icons.Default.Close, contentDescription = "취소") }
                        }
                    }
                }
            }
            val list = plans
            if (list != null && list.isEmpty()) {
                item {
                    Column(Modifier.fillMaxWidth().padding(top = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("아직 플랜이 없어요", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "\"카페, 공원, 저녁 재즈바\"처럼\n순서만 정해 두고 돌아다녀 보세요.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            items(list.orEmpty(), key = { it.id }) { plan ->
                PlanCard(plan, onClick = { onOpenPlan(plan.id) }, onDelete = { toDelete = plan })
            }
        }
    }

    if (showCreate) {
        var title by rememberSaveable { mutableStateOf(defaultPlanTitle()) }
        AlertDialog(
            onDismissRequest = { showCreate = false },
            title = { Text("새 플랜") },
            text = {
                OutlinedTextField(value = title, onValueChange = { title = it }, singleLine = true, label = { Text("이름") })
            },
            confirmButton = {
                TextButton(onClick = {
                    showCreate = false
                    repository.createPlan(title.ifBlank { defaultPlanTitle() }, onOpenPlan)
                }) { Text("만들기") }
            },
            dismissButton = { TextButton(onClick = { showCreate = false }) { Text("취소") } },
        )
    }

    toDelete?.let { plan ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text("플랜 삭제") },
            text = { Text("\"${plan.title}\"과 장소 ${plan.total}곳을 삭제할까요?") },
            confirmButton = {
                TextButton(onClick = { repository.deletePlan(plan.id); toDelete = null }) { Text("삭제") }
            },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text("취소") } },
        )
    }
}

@Composable
private fun PlanCard(plan: PlanSummary, onClick: () -> Unit, onDelete: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(plan.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        Instant.ofEpochMilli(plan.createdAt).atZone(ZoneId.systemDefault()).toLocalDate().format(dateFmt),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = onDelete) { Icon(Icons.Default.Delete, contentDescription = "삭제") }
            }
            if (plan.total > 0) {
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(
                    progress = { plan.finished.toFloat() / plan.total },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(6.dp))
                val now = plan.currentName?.let { " · 지금: $it" } ?: if (plan.finished == plan.total) " · 다 돌았어요" else ""
                Text("${plan.finished}/${plan.total}곳$now", style = MaterialTheme.typography.bodyMedium)
            } else {
                Text("장소 없음", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
