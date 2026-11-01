package app.wanderbar.domain

/** Pure helpers for route data (decoding and formatting). */
object RouteMath {

    /** Decodes a Google encoded polyline into (lat, lng) pairs. */
    fun decodePolyline(encoded: String): List<Pair<Double, Double>> {
        val out = mutableListOf<Pair<Double, Double>>()
        var index = 0
        var lat = 0
        var lng = 0
        while (index < encoded.length) {
            var result = 0
            var shift = 0
            var b: Int
            do {
                b = encoded[index++].code - 63
                result = result or ((b and 0x1f) shl shift)
                shift += 5
            } while (b >= 0x20 && index < encoded.length)
            lat += if (result and 1 != 0) (result shr 1).inv() else result shr 1

            result = 0
            shift = 0
            do {
                b = encoded[index++].code - 63
                result = result or ((b and 0x1f) shl shift)
                shift += 5
            } while (b >= 0x20 && index < encoded.length)
            lng += if (result and 1 != 0) (result shr 1).inv() else result shr 1

            out += lat / 1e5 to lng / 1e5
        }
        return out
    }

    /** Routes API durations look like "1234s". */
    fun parseDurationSeconds(s: String?): Long = s?.trim()?.removeSuffix("s")?.toDoubleOrNull()?.toLong() ?: 0L

    /** 75 -> "1분", 3900 -> "1시간 5분", 7200 -> "2시간". */
    fun formatDuration(seconds: Long): String {
        val totalMin = ((seconds + 30) / 60).coerceAtLeast(1)
        val h = totalMin / 60
        val m = totalMin % 60
        return when {
            h == 0L -> "${m}분"
            m == 0L -> "${h}시간"
            else -> "${h}시간 ${m}분"
        }
    }

    /** 850 -> "850m", 12345 -> "12.3km". */
    fun formatDistance(meters: Long): String =
        if (meters < 1000) "${meters}m" else "%.1fkm".format(java.util.Locale.US, meters / 1000.0)
}
