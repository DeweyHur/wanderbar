package app.wanderbar.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.wanderbar.data.PlaceDetails
import app.wanderbar.data.PlaceEntity
import app.wanderbar.data.Suggestion
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState

/** Google-Maps-style list of autocomplete predictions. */
@Composable
fun SuggestionList(suggestions: List<Suggestion>, onPick: (Suggestion) -> Unit, modifier: Modifier = Modifier) {
    Card(modifier.fillMaxWidth()) {
        suggestions.forEachIndexed { i, s ->
            if (i > 0) HorizontalDivider()
            Row(
                Modifier.fillMaxWidth().clickable { onPick(s) }.padding(horizontal = 12.dp, vertical = 10.dp),
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

/** Small map with one marker, for a place's detail/edit screen. */
@Composable
fun PlaceMiniMap(lat: Double, lng: Double, title: String, modifier: Modifier = Modifier) {
    val position = LatLng(lat, lng)
    val camera = rememberCameraPositionState()
    val marker = remember(lat, lng) { MarkerState(position) }
    LaunchedEffect(lat, lng) { camera.move(CameraUpdateFactory.newLatLngZoom(position, 15f)) }
    GoogleMap(
        modifier = modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(12.dp)),
        cameraPositionState = camera,
        uiSettings = MapUiSettings(zoomControlsEnabled = false, mapToolbarEnabled = false, scrollGesturesEnabled = true),
    ) {
        Marker(state = marker, title = title)
    }
}

fun PlaceDetails.toEntity(planId: Long, fallbackName: String): PlaceEntity = PlaceEntity(
    planId = planId,
    name = name.ifBlank { fallbackName },
    address = address,
    mapsUrl = mapsUrl,
    hoursRaw = hoursRaw,
    lat = lat,
    lng = lng,
    googlePlaceId = googlePlaceId,
)
