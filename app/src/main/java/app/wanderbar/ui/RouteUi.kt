package app.wanderbar.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.wanderbar.data.PlaceEntity
import app.wanderbar.data.RouteLeg
import app.wanderbar.data.RouteResult
import app.wanderbar.data.RoutesClient
import app.wanderbar.data.hasLocation
import app.wanderbar.data.status
import app.wanderbar.domain.PlaceStatus
import app.wanderbar.domain.RouteMath
import com.google.android.gms.maps.model.LatLng

/** Driving route through the plan's located stops (dropped stops excluded), in list order. */
data class PlanRoute(
    val stops: List<PlaceEntity>,
    val result: RouteResult? = null,
    val error: String? = null,
    val loading: Boolean = false,
) {
    /** Leg that starts at [placeId], if any. */
    fun legFrom(placeId: Long): RouteLeg? {
        val i = stops.indexOfFirst { it.id == placeId }
        return if (i >= 0) result?.legs?.getOrNull(i) else null
    }

    /** Seconds left from the current stop (or the first not-done stop) to the end. */
    val remainingSeconds: Long?
        get() {
            val legs = result?.legs ?: return null
            val from = stops.indexOfFirst { it.status == PlaceStatus.CURRENT || it.status == PlaceStatus.PENDING }
            if (from < 0) return 0
            return legs.drop(from).sumOf { it.seconds }
        }
}

@Composable
fun rememberPlanRoute(places: List<PlaceEntity>?): PlanRoute {
    val context = LocalContext.current
    val client = remember { RoutesClient.get(context) }
    val stops = places.orEmpty()
        .filter { it.hasLocation && it.status != PlaceStatus.SKIPPED }
        .take(RoutesClient.MAX_POINTS)
    val points = stops.map { LatLng(it.lat!!, it.lng!!) }
    var state by remember { mutableStateOf(PlanRoute(stops)) }

    LaunchedEffect(points, stops.map { it.status }) {
        if (client == null || points.size < 2) {
            state = PlanRoute(stops)
            return@LaunchedEffect
        }
        val cached = client.cached(points)
        if (cached != null) {
            state = PlanRoute(stops, cached)
            return@LaunchedEffect
        }
        state = PlanRoute(stops, loading = true)
        state = try {
            PlanRoute(stops, client.route(points))
        } catch (e: Exception) {
            PlanRoute(stops, error = e.message ?: e.javaClass.simpleName)
        }
    }
    return state
}

fun RouteLeg.label(): String = "${RouteMath.formatDuration(seconds)} · ${RouteMath.formatDistance(meters)}"

@Composable
fun RouteSummaryCard(route: PlanRoute, modifier: Modifier = Modifier) {
    val result = route.result
    if (result == null && route.error == null && !route.loading) return
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            when {
                result != null -> {
                    Text(
                        "전체 동선 ${RouteMath.formatDuration(result.seconds)} · ${RouteMath.formatDistance(result.meters)}",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    val remaining = route.remainingSeconds
                    val sub = buildString {
                        append("${route.stops.size}곳 운전 기준, 지금 교통 반영")
                        if (remaining != null && remaining in 1 until result.seconds) {
                            append(" · 남은 구간 ${RouteMath.formatDuration(remaining)}")
                        }
                    }
                    Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                route.loading -> Text("경로 계산 중…", style = MaterialTheme.typography.bodySmall)
                else -> Text(
                    "경로 계산 실패: ${route.error}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}
