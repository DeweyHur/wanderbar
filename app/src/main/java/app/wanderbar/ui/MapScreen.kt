package app.wanderbar.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wanderbar.data.PlaceEntity
import app.wanderbar.data.PlacesSearch
import app.wanderbar.data.Repository
import app.wanderbar.data.hasLocation
import app.wanderbar.data.status
import app.wanderbar.domain.PlaceStatus
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(
    repository: Repository,
    planId: Long,
    onBack: () -> Unit,
    onOpenPlace: (Long) -> Unit,
) {
    val plan by remember(planId) { repository.observePlan(planId) }.collectAsStateWithLifecycle(initialValue = null)
    val places by remember(planId) { repository.observePlaces(planId) }.collectAsStateWithLifecycle(initialValue = null)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(plan?.title?.let { "$it · 지도" } ?: "지도") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로") }
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            val list = places
            when {
                !PlacesSearch.isConfigured -> Centered("구글 API 키가 없는 빌드라 지도를 띄울 수 없어요.")
                list == null -> Unit
                else -> PlanMap(list, onOpenPlace)
            }
        }
    }
}

@Composable
private fun PlanMap(places: List<PlaceEntity>, onOpenPlace: (Long) -> Unit) {
    val numbered = places.mapIndexed { i, p -> i + 1 to p }
    val located = numbered.filter { it.second.hasLocation }
    val missing = numbered.size - located.size
    val points = located.map { LatLng(it.second.lat!!, it.second.lng!!) }

    val camera = rememberCameraPositionState()
    var mapLoaded by remember { mutableStateOf(false) }
    LaunchedEffect(mapLoaded, points) {
        if (!mapLoaded || points.isEmpty()) return@LaunchedEffect
        if (points.size == 1) {
            camera.move(CameraUpdateFactory.newLatLngZoom(points.first(), 15f))
        } else {
            val bounds = LatLngBounds.builder().apply { points.forEach { include(it) } }.build()
            camera.move(CameraUpdateFactory.newLatLngBounds(bounds, 160))
        }
    }

    Box(Modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = camera,
            uiSettings = MapUiSettings(zoomControlsEnabled = false, mapToolbarEnabled = false),
            onMapLoaded = { mapLoaded = true },
        ) {
            if (points.size > 1) {
                Polyline(points = points, color = Color(0xFF1F3A34), width = 10f)
            }
            located.forEach { (number, place) ->
                val hue = when (place.status) {
                    PlaceStatus.CURRENT -> BitmapDescriptorFactory.HUE_AZURE
                    PlaceStatus.PENDING -> BitmapDescriptorFactory.HUE_ORANGE
                    PlaceStatus.DONE -> BitmapDescriptorFactory.HUE_GREEN
                    PlaceStatus.SKIPPED -> BitmapDescriptorFactory.HUE_VIOLET
                }
                val state = remember(place.id, place.lat, place.lng) { MarkerState(LatLng(place.lat!!, place.lng!!)) }
                Marker(
                    state = state,
                    title = "$number. ${place.name}",
                    snippet = place.status.label() + " · 눌러서 열기",
                    icon = BitmapDescriptorFactory.defaultMarker(hue),
                    alpha = if (place.status == PlaceStatus.DONE || place.status == PlaceStatus.SKIPPED) 0.5f else 1f,
                    zIndex = if (place.status == PlaceStatus.CURRENT) 1f else 0f,
                    onInfoWindowClick = { onOpenPlace(place.id) },
                )
            }
        }

        if (located.isEmpty() || missing > 0) {
            Card(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text(
                        if (located.isEmpty()) "지도에 표시할 위치가 아직 없어요" else "위치 없는 장소 ${missing}곳",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        "장소를 눌러 편집 → 구글 검색으로 고르면 지도에 올라가요.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    numbered.filter { !it.second.hasLocation }.take(5).forEach { (n, p) ->
                        Text(
                            "$n. ${p.name}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.fillMaxWidth().clickable { onOpenPlace(p.id) }.padding(vertical = 4.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Centered(text: String) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}
