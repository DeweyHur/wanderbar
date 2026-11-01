package app.wanderbar.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LinksAndShareTest {
    @Test fun directionsEncodesQuery() {
        assertEquals(
            "https://www.google.com/maps/dir/?api=1&destination=Blue+Bottle%2C+315+Linden+St&travelmode=driving",
            Links.googleDirections("Blue Bottle", "315 Linden St"),
        )
    }

    @Test fun yelpOmitsEmptyLocation() {
        assertEquals("https://www.yelp.com/search?find_desc=%EC%9E%AC%EC%A6%88%EB%B0%94", Links.yelpSearch("재즈바", " "))
        assertEquals(
            "https://www.yelp.com/search?find_desc=SFJAZZ&find_loc=San+Francisco",
            Links.yelpSearch("SFJAZZ", "San Francisco"),
        )
    }

    @Test fun teslaFormats() {
        val name = "Blue Bottle"; val addr = "315 Linden St"; val url = "https://maps.app.goo.gl/abc"
        assertEquals("315 Linden St", Links.teslaShareText(TeslaFormat.ADDRESS, name, addr, url))
        assertEquals("Park", Links.teslaShareText(TeslaFormat.ADDRESS, "Park", "", null))
        assertEquals("Blue Bottle, 315 Linden St", Links.teslaShareText(TeslaFormat.NAME_ADDRESS, name, addr, url))
        assertNull(Links.teslaShareText(TeslaFormat.COORDS, name, addr, url))
        assertEquals("37.774900,-122.419400", Links.teslaShareText(TeslaFormat.COORDS, name, addr, url, 37.7749, -122.4194))
        assertEquals(url, Links.teslaShareText(TeslaFormat.LINK, name, addr, url))
        assertEquals("Blue Bottle\n315 Linden St\n$url", Links.teslaShareText(TeslaFormat.FULL, name, addr, url))
        assertEquals(
            "Park\nhttps://www.google.com/maps/search/?api=1&query=Park",
            Links.teslaShareText(TeslaFormat.FULL, "Park", null, null),
        )
    }

    @Test fun parsesGoogleMapsShare() {
        val p = SharedText.parse("Blue Bottle Coffee\n315 Linden St, San Francisco, CA 94102\nhttps://maps.app.goo.gl/abc123")
        assertEquals(SharedPlace("Blue Bottle Coffee", "315 Linden St, San Francisco, CA 94102", "https://maps.app.goo.gl/abc123"), p)
    }

    @Test fun parsesUrlOnlyAndSubject() {
        val p = SharedText.parse("https://maps.app.goo.gl/xyz", subject = "Golden Gate Park")
        assertEquals(SharedPlace("Golden Gate Park", "", "https://maps.app.goo.gl/xyz"), p)
        val q = SharedText.parse("그냥 메모")
        assertNull(q.mapsUrl)
        assertEquals("그냥 메모", q.name)
    }
}
