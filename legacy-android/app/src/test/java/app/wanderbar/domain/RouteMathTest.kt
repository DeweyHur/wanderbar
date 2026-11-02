package app.wanderbar.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class RouteMathTest {
    @Test fun decodesGoogleExample() {
        // Example from Google's encoded polyline documentation.
        val pts = RouteMath.decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")
        assertEquals(listOf(38.5 to -120.2, 40.7 to -120.95, 43.252 to -126.453), pts)
    }

    @Test fun durations() {
        assertEquals(1234L, RouteMath.parseDurationSeconds("1234s"))
        assertEquals(0L, RouteMath.parseDurationSeconds(null))
        assertEquals("1분", RouteMath.formatDuration(20))
        assertEquals("1시간 5분", RouteMath.formatDuration(3900))
        assertEquals("2시간", RouteMath.formatDuration(7200))
    }

    @Test fun distances() {
        assertEquals("850m", RouteMath.formatDistance(850))
        assertEquals("12.3km", RouteMath.formatDistance(12345))
    }
}
