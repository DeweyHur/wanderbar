package app.wanderbar.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.wanderbar.data.PlaceEntity
import app.wanderbar.data.Repository
import app.wanderbar.domain.Hours
import app.wanderbar.domain.SharedPlace
import app.wanderbar.domain.SharedText

/** Add (placeId == null) or edit a place. [prefill] comes from a Google Maps share. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceEditScreen(
    repository: Repository,
    planId: Long,
    placeId: Long?,
    prefill: SharedPlace?,
    onDone: () -> Unit,
) {
    var name by rememberSaveable { mutableStateOf(prefill?.name.orEmpty()) }
    var address by rememberSaveable { mutableStateOf(prefill?.address.orEmpty()) }
    var mapsUrl by rememberSaveable { mutableStateOf(prefill?.mapsUrl.orEmpty()) }
    var hoursRaw by rememberSaveable { mutableStateOf("") }
    var memo by rememberSaveable { mutableStateOf("") }
    var loadedExisting by rememberSaveable { mutableStateOf(false) }
    val now by rememberNow()

    LaunchedEffect(placeId) {
        if (placeId != null && !loadedExisting) {
            repository.getPlace(placeId)?.let {
                name = it.name
                address = it.address
                mapsUrl = it.mapsUrl
                hoursRaw = it.hoursRaw
                memo = it.memo
            }
            loadedExisting = true
        }
    }

    fun save() {
        val draft = PlaceEntity(
            id = placeId ?: 0,
            planId = planId,
            name = name,
            address = address,
            mapsUrl = mapsUrl,
            hoursRaw = hoursRaw,
            memo = memo,
        )
        if (placeId == null) repository.addPlaces(planId, listOf(draft)) else repository.updateDetails(draft)
        onDone()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (placeId == null) "장소 추가" else "장소 편집") },
                navigationIcon = { IconButton(onClick = onDone) { Icon(Icons.Default.Close, contentDescription = "닫기") } },
                actions = { TextButton(onClick = { save() }, enabled = name.isNotBlank()) { Text("저장") } },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = mapsUrl,
                onValueChange = { input ->
                    // Pasting a whole Google Maps share ("Name\nAddress\nURL") fills the blanks.
                    val parsed = SharedText.parse(input)
                    if (parsed.mapsUrl != null && (parsed.name.isNotEmpty() || parsed.address.isNotEmpty())) {
                        mapsUrl = parsed.mapsUrl
                        if (name.isBlank()) name = parsed.name
                        if (address.isBlank()) address = parsed.address
                    } else {
                        mapsUrl = input.trim()
                    }
                },
                label = { Text("구글맵 링크 (선택)") },
                supportingText = { Text("구글맵 공유 내용을 통째로 붙여 넣으면 이름과 주소가 채워져요") },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("이름 *") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = address,
                onValueChange = { address = it },
                label = { Text("주소 (선택)") },
                modifier = Modifier.fillMaxWidth(),
            )
            val parsedHours = Hours.parse(hoursRaw)
            OutlinedTextField(
                value = hoursRaw,
                onValueChange = { hoursRaw = it },
                label = { Text("영업시간 (선택)") },
                placeholder = { Text("월-금 11:00-22:00, 토 12-23, 일 휴무") },
                supportingText = {
                    when {
                        hoursRaw.isBlank() -> Text("예: 09:00-22:00 · Mon-Fri 9-18; Sat closed · Fri-Sat 6pm-2am")
                        parsedHours == null -> Text("형식을 알아보지 못했어요", color = MaterialTheme.colorScheme.error)
                        else -> Text("지금 기준: " + (Hours.status(parsedHours, now).label() ?: "-"))
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = memo,
                onValueChange = { memo = it },
                label = { Text("메모 (선택)") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
