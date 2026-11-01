package app.wanderbar.data

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import app.wanderbar.BuildConfig
import app.wanderbar.domain.RouteMath
import com.google.android.gms.maps.model.LatLng
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

data class RouteLeg(val seconds: Long, val meters: Long, val path: List<LatLng>)

data class RouteResult(val legs: List<RouteLeg>) {
    val seconds: Long get() = legs.sumOf { it.seconds }
    val meters: Long get() = legs.sumOf { it.meters }
}

/**
 * Google Routes API (computeRoutes), driving with traffic, through every stop in order.
 * Results are cached per exact list of coordinates, so re-opening screens costs nothing.
 */
class RoutesClient private constructor(private val context: Context) {
    private val cache = object : LinkedHashMap<String, RouteResult>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, RouteResult>?) = size > 20
    }
    private val certSha1: String? by lazy { signingCertSha1() }

    fun cached(points: List<LatLng>): RouteResult? = synchronized(cache) { cache[key(points)] }

    suspend fun route(points: List<LatLng>): RouteResult {
        require(points.size in 2..MAX_POINTS) { "경유지는 2~${MAX_POINTS}곳" }
        cached(points)?.let { return it }
        val result = withContext(Dispatchers.IO) { request(points) }
        synchronized(cache) { cache[key(points)] = result }
        return result
    }

    private fun key(points: List<LatLng>) =
        points.joinToString("|") { "%.5f,%.5f".format(java.util.Locale.US, it.latitude, it.longitude) }

    private fun waypoint(p: LatLng) = JSONObject().put(
        "location",
        JSONObject().put("latLng", JSONObject().put("latitude", p.latitude).put("longitude", p.longitude)),
    )

    private fun request(points: List<LatLng>): RouteResult {
        val body = JSONObject()
            .put("origin", waypoint(points.first()))
            .put("destination", waypoint(points.last()))
            .put("intermediates", JSONArray().apply { points.subList(1, points.size - 1).forEach { put(waypoint(it)) } })
            .put("travelMode", "DRIVE")
            .put("routingPreference", "TRAFFIC_AWARE")

        val conn = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 15_000
            readTimeout = 20_000
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Goog-Api-Key", BuildConfig.MAPS_API_KEY)
            setRequestProperty("X-Goog-FieldMask", "routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline")
            // Lets an Android-restricted key work for this REST call.
            setRequestProperty("X-Android-Package", context.packageName)
            certSha1?.let { setRequestProperty("X-Android-Cert", it) }
        }
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) {
                val msg = runCatching { JSONObject(text).getJSONObject("error").getString("message") }.getOrNull()
                throw IllegalStateException("Routes API $code: ${msg ?: text.take(200)}")
            }
            val routes = JSONObject(text).optJSONArray("routes")
            if (routes == null || routes.length() == 0) throw IllegalStateException("경로를 찾지 못했어요")
            val legs = routes.getJSONObject(0).getJSONArray("legs")
            return RouteResult(
                (0 until legs.length()).map { i ->
                    val leg = legs.getJSONObject(i)
                    RouteLeg(
                        seconds = RouteMath.parseDurationSeconds(leg.optString("duration")),
                        meters = leg.optLong("distanceMeters"),
                        path = RouteMath.decodePolyline(
                            leg.optJSONObject("polyline")?.optString("encodedPolyline").orEmpty(),
                        ).map { LatLng(it.first, it.second) },
                    )
                },
            )
        } finally {
            conn.disconnect()
        }
    }

    private fun signingCertSha1(): String? = try {
        val pm = context.packageManager
        val signatures = if (Build.VERSION.SDK_INT >= 28) {
            pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                .signingInfo?.apkContentsSigners
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES).signatures
        }
        signatures?.firstOrNull()?.toByteArray()?.let { bytes ->
            MessageDigest.getInstance("SHA-1").digest(bytes).joinToString("") { "%02X".format(it) }
        }
    } catch (e: Exception) {
        null
    }

    companion object {
        private const val ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes"
        const val MAX_POINTS = 27 // origin + 25 intermediates + destination

        @Volatile private var instance: RoutesClient? = null

        fun get(context: Context): RoutesClient? {
            if (!PlacesSearch.isConfigured) return null
            return instance ?: synchronized(this) {
                instance ?: RoutesClient(context.applicationContext).also { instance = it }
            }
        }
    }
}
