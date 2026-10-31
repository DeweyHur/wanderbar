package app.wanderbar.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.wanderbar.data.PlaceEntity
import app.wanderbar.data.PlacesSearch
import app.wanderbar.data.Repository
import app.wanderbar.data.Suggestion
import app.wanderbar.domain.Hours
import app.wanderbar.domain.SharedPlace
import app.wanderbar.domain.SharedText
import com.google.android.gms.maps.model.LatLng
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

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
    val context = LocalContext.current
    val search = remember { PlacesSearch.get(context) }
    val scope = rememberCoroutineScope()

    var name by rememberSaveable { mutableStateOf(prefill?.name.orEmpty()) }
    var address by rememberSaveable { mutableStateOf(prefill?.address.orEmpty()) }
    var mapsUrl by rememberSaveable { mutableStateOf(prefill?.mapsUrl.orEmpty()) }
    var hoursRaw by rememberSaveable { mutableStateOf("") }
    var memo by rememberSaveable { mutableStateOf("") }
    var lat by rememberSaveable { mutableStateOf<Double?>(null) }
    var lng by rememberSaveable { mutableStateOf<Double?>(null) }
    var googlePlaceId by rememberSaveable { mutableStateOf("") }
    var loadedExisting by rememberSaveable { mutableStateOf(false) }

    var query by rememberSaveable { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<Suggestion>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var searchError by remember { mutableStateOf<String?>(null) }
    var bias by remember { mutableStateOf<LatLng?>(null) }
    val now by rememberNow()

    LaunchedEffect(placeId) {
        if (placeId != null && !loadedExisting) {
            repository.getPlace(placeId)?.let {
                name = it.name
                address = it.address
                mapsUrl = it.mapsUrl
                hoursRaw = it.hoursRaw
                memo = it.memo
                lat = it.lat
                lng = it.lng
                googlePlaceId = it.googlePlaceId
            }
            loadedExisting = true
            // A quick-added "카페" without a location: start the search with its name.
            if (search != null && lat == null && name.isNotBlank() && query.isBlank()) query = name
        }
        // Bias suggestions toward places already on this plan.
        val anchor = repository.observePlaces(planId).first().lastOrNull { it.lat != null && it.lng != null }
        bias = anchor?.let { LatLng(it.lat!!, it.lng!!) }
    }

    LaunchedEffect(query) {
        searchError = null
        if (search == null || query.isBlank()) {
            suggestions = emptyList()
            return@LaunchedEffect
        }
        delay(300) // debounce typing
        searching = true
        suggestions = try {
            search.suggest(query, bias)
        } catch (e: Exception) {
            searchError = "검색 실패: ${e.message ?: e.javaClass.simpleName}"
            emptyList()
        }
        searching = false
    }

    fun pick(s: Suggestion) {
        val client = search ?: return
        scope.launch {
            searching = true
            try {
                val d = client.details(s.placeId)
                name = d.name.ifBlank { s.primary }
                address = d.address
                mapsUrl = d.mapsUrl
                if (d.hoursRaw.isNotBlank()) hoursRaw = d.hoursRaw
                lat = d.lat
                lng = d.lng
                googlePlaceId = d.googlePlaceId
                query = ""
                suggestions = emptyList()
            } catch (e: Exception) {
                searchError = "장소 정보를 못 가져왔어요: ${e.message ?: e.javaClass.simpleName}"
            }
            searching = false
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
            lat = lat,
            lng = lng,
            googlePlaceId = googlePlaceId,
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
            if (search != null) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("구글에서 장소 검색") },
                    placeholder = { Text(name.ifBlank { "가게 이름이나 주소" }) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    trailingIcon = {
                        if (searching) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        else if (query.isNotEmpty()) IconButton(onClick = { query = "" }) {
                            Icon(Icons.Default.Close, contentDescription = "지우기")
                        }
                    },
                    singleLine = true,
                    supportingText = {
                        val err = searchError
                        when {
                            err != null -> Text(err, color = MaterialTheme.colorScheme.error)
                            lat != null -> Text("지도 위치 있음 · 다시 검색하면 바뀌어요")
                            else -> Text("고르면 이름·주소·영업시간·지도 위치가 채워져요")
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                if (suggestions.isNotEmpty()) {
                    Card(Modifier.fillMaxWidth()) {
                        suggestions.forEachIndexed { i, s ->
                            if (i > 0) HorizontalDivider()
                            Row(
                                Modifier.fillMaxWidth().clickable { pick(s) }.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Default.Place, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(s.primary, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    if (s.secondary.isNotBlank()) {
                                        Text(
                                            s.secondary,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                Text(
                    "구글 API 키가 없는 빌드라 장소 검색이 꺼져 있어요.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
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
