package app.wanderbar.domain

/** A place parsed from text shared into the app (typically from Google Maps). */
data class SharedPlace(val name: String, val address: String, val mapsUrl: String?)

object SharedText {
    private val urlRegex = Regex("""https?://\S+""")

    /**
     * Google Maps shares e.g.
     *   "Blue Bottle Coffee\n315 Linden St, San Francisco, CA 94102\nhttps://maps.app.goo.gl/abc"
     * Sometimes only the URL, sometimes a subject line holds the name.
     */
    fun parse(text: String?, subject: String? = null): SharedPlace {
        val raw = text.orEmpty()
        val url = urlRegex.find(raw)?.value?.trimEnd('.', ',', ')')
        val lines = raw.replace(urlRegex, "\n")
            .lines()
            .map { it.trim().trim('"') }
            .filter { it.isNotEmpty() }
        val subjectName = subject?.trim().orEmpty()
        val name: String
        val addressLines: List<String>
        if (subjectName.isNotEmpty() && lines.firstOrNull() != subjectName) {
            name = subjectName
            addressLines = lines
        } else {
            name = lines.firstOrNull().orEmpty()
            addressLines = lines.drop(1)
        }
        return SharedPlace(
            name = name,
            address = addressLines.joinToString(", "),
            mapsUrl = url,
        )
    }
}
