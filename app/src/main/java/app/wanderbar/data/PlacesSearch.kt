package app.wanderbar.data

import android.content.Context
import app.wanderbar.BuildConfig
import app.wanderbar.domain.Hours
import app.wanderbar.domain.MinuteRange
import app.wanderbar.domain.WeeklyHours
import com.google.android.gms.maps.model.LatLng
import com.google.android.libraries.places.api.Places
import com.google.android.libraries.places.api.model.AutocompleteSessionToken
import com.google.android.libraries.places.api.model.OpeningHours
import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.api.model.RectangularBounds
import com.google.android.libraries.places.api.net.FetchPlaceRequest
import com.google.android.libraries.places.api.net.FindAutocompletePredictionsRequest
import com.google.android.libraries.places.api.net.PlacesClient
import kotlinx.coroutines.tasks.await
import java.time.DayOfWeek

data class Suggestion(val placeId: String, val primary: String, val secondary: String)

data class PlaceDetails(
    val googlePlaceId: String,
    val name: String,
    val address: String,
    val lat: Double?,
    val lng: Double?,
    val mapsUrl: String,
    val hoursRaw: String,
)

/**
 * Google Places (New) autocomplete + details. One session token per search-and-pick,
 * which Google bills as a single session.
 */
class PlacesSearch private constructor(private val client: PlacesClient) {
    private var session: AutocompleteSessionToken = AutocompleteSessionToken.newInstance()

    suspend fun suggest(query: String, near: LatLng?): List<Suggestion> {
        if (query.isBlank()) return emptyList()
        val builder = FindAutocompletePredictionsRequest.builder()
            .setQuery(query)
            .setSessionToken(session)
        if (near != null) {
            builder.setLocationBias(
                RectangularBounds.newInstance(
                    LatLng(near.latitude - BIAS_DEG, near.longitude - BIAS_DEG),
                    LatLng(near.latitude + BIAS_DEG, near.longitude + BIAS_DEG),
                ),
            )
        }
        return client.findAutocompletePredictions(builder.build()).await().autocompletePredictions.map {
            Suggestion(it.placeId, it.getPrimaryText(null).toString(), it.getSecondaryText(null).toString())
        }
    }

    suspend fun details(placeId: String): PlaceDetails {
        val request = FetchPlaceRequest.builder(placeId, FIELDS).setSessionToken(session).build()
        val place = client.fetchPlace(request).await().place
        session = AutocompleteSessionToken.newInstance()
        return PlaceDetails(
            googlePlaceId = placeId,
            name = place.displayName.orEmpty(),
            address = place.formattedAddress.orEmpty(),
            lat = place.location?.latitude,
            lng = place.location?.longitude,
            mapsUrl = place.googleMapsUri?.toString().orEmpty(),
            hoursRaw = place.openingHours?.let(::toHoursRaw).orEmpty(),
        )
    }

    companion object {
        private const val BIAS_DEG = 0.5
        private val FIELDS = listOf(
            Place.Field.ID,
            Place.Field.DISPLAY_NAME,
            Place.Field.FORMATTED_ADDRESS,
            Place.Field.LOCATION,
            Place.Field.GOOGLE_MAPS_URI,
            Place.Field.OPENING_HOURS,
        )

        val isConfigured: Boolean get() = BuildConfig.MAPS_API_KEY.isNotBlank()

        @Volatile private var instance: PlacesSearch? = null

        /** Null when no API key was built into the app. */
        fun get(context: Context): PlacesSearch? {
            if (!isConfigured) return null
            instance?.let { return it }
            return synchronized(this) {
                instance ?: run {
                    if (!Places.isInitialized()) {
                        Places.initializeWithNewPlacesApiEnabled(context.applicationContext, BuildConfig.MAPS_API_KEY)
                    }
                    PlacesSearch(Places.createClient(context.applicationContext)).also { instance = it }
                }
            }
        }

        /** Google's structured periods -> our editable hours text. */
        fun toHoursRaw(hours: OpeningHours): String {
            val days = mutableMapOf<DayOfWeek, MutableList<MinuteRange>>()
            for (period in hours.periods) {
                val open = period.open ?: continue
                val close = period.close
                val day = DayOfWeek.valueOf(open.day.name)
                val start = open.time.hours * 60 + open.time.minutes
                if (close == null) {
                    // A single period with no close means open 24/7.
                    DayOfWeek.entries.forEach { days.getOrPut(it) { mutableListOf() }.add(MinuteRange(0, 24 * 60)) }
                    continue
                }
                var end = close.time.hours * 60 + close.time.minutes
                if (end == 0 && close.day != open.day) end = 24 * 60
                days.getOrPut(day) { mutableListOf() }.add(MinuteRange(start, end))
            }
            if (days.isEmpty()) return ""
            return Hours.format(WeeklyHours(days.mapValues { (_, v) -> v.sortedBy { it.start } }))
        }
    }
}
