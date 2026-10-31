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
     * Text handed to the Tesla app via ACTION_SEND.
     * Mirrors the format Google Maps itself shares ("Name\nAddress\nURL"), which is the
     * case the Tesla app is known to accept. Verified per M3 on the real car.
     */
    fun teslaShareText(name: String, address: String?, mapsUrl: String?): String {
        val url = mapsUrl?.trim()?.takeIf { it.isNotEmpty() } ?: googleSearch(name, address)
        return listOf(name.trim(), address?.trim().orEmpty(), url)
            .filter { it.isNotEmpty() }
            .joinToString("\n")
    }
}
