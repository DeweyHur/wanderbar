package app.wanderbar.domain

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** Link builders that need no API key. */
object Links {

    private fun enc(s: String): String = URLEncoder.encode(s, StandardCharsets.UTF_8.name())

    /** What we search for: "name, address" when both exist. */
    fun query(name: String, address: String?): String =
        listOf(name.trim(), address?.trim().orEmpty()).filter { it.isNotEmpty() }.joinToString(", ")

    /** Google Maps driving directions from the current location. */
    fun googleDirections(name: String, address: String?): String =
        "https://www.google.com/maps/dir/?api=1&destination=${enc(query(name, address))}&travelmode=driving"

    /** Google Maps place search (used when no shared Maps link exists). */
    fun googleSearch(name: String, address: String?): String =
        "https://www.google.com/maps/search/?api=1&query=${enc(query(name, address))}"

    /** Yelp search. The address, when present, narrows the location. */
    fun yelpSearch(name: String, address: String?): String {
        val base = "https://www.yelp.com/search?find_desc=${enc(name.trim())}"
        val loc = address?.trim().orEmpty()
        return if (loc.isEmpty()) base else "$base&find_loc=${enc(loc)}"
    }

    /**
     * Text handed to the Tesla app via ACTION_SEND, in the given [format].
     * Returns null when the format can't be built for this place (e.g. no coordinates).
     */
    fun teslaShareText(
        format: TeslaFormat,
        name: String,
        address: String?,
        mapsUrl: String?,
        lat: Double? = null,
        lng: Double? = null,
    ): String? {
        val n = name.trim()
        val a = address?.trim().orEmpty()
        val url = mapsUrl?.trim().orEmpty()
        return when (format) {
            TeslaFormat.ADDRESS -> a.ifEmpty { n }.ifEmpty { null }
            TeslaFormat.NAME_ADDRESS -> query(n, a).ifEmpty { null }
            TeslaFormat.COORDS -> if (lat != null && lng != null) "%.6f,%.6f".format(java.util.Locale.US, lat, lng) else null
            TeslaFormat.LINK -> url.ifEmpty { googleSearch(n, a) }
            TeslaFormat.FULL -> listOf(n, a, url.ifEmpty { googleSearch(n, a) }).filter { it.isNotEmpty() }.joinToString("\n")
        }
    }
}

/** Ways to phrase a destination for the Tesla app. Which one the app accepts is verified on the car (M3). */
enum class TeslaFormat(val label: String) {
    ADDRESS("주소만"),
    NAME_ADDRESS("이름, 주소 (한 줄)"),
    COORDS("좌표 (위도,경도)"),
    LINK("구글맵 링크만"),
    FULL("이름 / 주소 / 링크 (구글맵 공유 모양)"),
}
