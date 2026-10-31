package app.wanderbar.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.LocalDateTime
import java.time.LocalTime

class HoursTest {
    // 2026-11-02 is a Monday.
    private fun at(day: DayOfWeek, h: Int, m: Int = 0): LocalDateTime =
        LocalDateTime.of(2026, 11, 2 + (day.value - 1), h, m)

    @Test fun emptyIsUnknown() {
        assertNull(Hours.parse(""))
        assertNull(Hours.parse("call ahead"))
        assertEquals(HoursStatus.Unknown, Hours.status(null as String?, at(DayOfWeek.MONDAY, 10)))
    }

    @Test fun everyDaySimple() {
        val h = Hours.parse("09:00-22:00")!!
        assertEquals(7, h.days.size)
        assertEquals(HoursStatus.Open(LocalTime.of(22, 0)), Hours.status(h, at(DayOfWeek.SUNDAY, 12)))
        assertEquals(HoursStatus.ClosingSoon(LocalTime.of(22, 0), 30), Hours.status(h, at(DayOfWeek.SUNDAY, 21, 30)))
        assertEquals(HoursStatus.Closed(LocalTime.of(9, 0)), Hours.status(h, at(DayOfWeek.SUNDAY, 7)))
        assertEquals(HoursStatus.Closed(null), Hours.status(h, at(DayOfWeek.SUNDAY, 22)))
    }

    @Test fun englishDaysAndClosed() {
        val h = Hours.parse("Mon-Fri 9:00-18:00; Sat 10-14; Sun closed")!!
        assertEquals(listOf(MinuteRange(540, 1080)), h.days[DayOfWeek.WEDNESDAY])
        assertEquals(listOf(MinuteRange(600, 840)), h.days[DayOfWeek.SATURDAY])
        assertEquals(emptyList<MinuteRange>(), h.days[DayOfWeek.SUNDAY])
        assertTrue(Hours.status(h, at(DayOfWeek.SUNDAY, 12)) is HoursStatus.Closed)
    }

    @Test fun koreanSplitShift() {
        val h = Hours.parse("월-금 11:00-14:00 17:00-22:00, 토 12:00-23:00, 일 휴무")!!
        assertEquals(listOf(MinuteRange(660, 840), MinuteRange(1020, 1320)), h.days[DayOfWeek.TUESDAY])
        assertEquals(HoursStatus.Closed(LocalTime.of(17, 0)), Hours.status(h, at(DayOfWeek.TUESDAY, 15)))
        assertEquals(emptyList<MinuteRange>(), h.days[DayOfWeek.SUNDAY])
    }

    @Test fun commaSeparatedDays() {
        val h = Hours.parse("토, 일 10:00-20:00")!!
        assertEquals(setOf(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY), h.days.keys)
    }

    @Test fun overnightAmPm() {
        val h = Hours.parse("Fri-Sat 6pm-2am")!!
        assertEquals(listOf(MinuteRange(1080, 120)), h.days[DayOfWeek.FRIDAY])
        assertEquals(HoursStatus.Open(LocalTime.of(2, 0)), Hours.status(h, at(DayOfWeek.FRIDAY, 23)))
        // Saturday 01:30 is still Friday night.
        assertEquals(HoursStatus.ClosingSoon(LocalTime.of(2, 0), 30), Hours.status(h, at(DayOfWeek.SATURDAY, 1, 30)))
        assertTrue(Hours.status(h, at(DayOfWeek.THURSDAY, 23)) is HoursStatus.Closed)
    }

    @Test fun midnightEnd() {
        val h = Hours.parse("17:00-24:00")!!
        assertEquals(HoursStatus.Open(LocalTime.of(0, 0)), Hours.status(h, at(DayOfWeek.MONDAY, 20)))
        val h2 = Hours.parse("17:00-00:00")!!
        assertEquals(listOf(MinuteRange(1020, 1440)), h2.days[DayOfWeek.MONDAY])
    }

    @Test fun allDay() {
        assertEquals(HoursStatus.Open(null), Hours.status("24h", at(DayOfWeek.MONDAY, 23, 50)))
        assertEquals(HoursStatus.Open(null), Hours.status("매일 24시간", at(DayOfWeek.MONDAY, 3)))
    }

    @Test fun weekendWords() {
        val h = Hours.parse("평일 08:00-17:00 주말 10:00-15:00")!!
        assertEquals(listOf(MinuteRange(480, 1020)), h.days[DayOfWeek.FRIDAY])
        assertEquals(listOf(MinuteRange(600, 900)), h.days[DayOfWeek.SUNDAY])
    }

    @Test fun googleStyleSpaces() {
        val h = Hours.parse("Monday: 9:00\u202fAM\u2009\u2013\u20095:00\u202fPM")!!
        assertEquals(listOf(MinuteRange(540, 1020)), h.days[DayOfWeek.MONDAY])
    }

    @Test fun formatRoundTrips() {
        val raw = "Mon-Fri 11:00-14:00 17:00-22:00; Fri-Sat 6pm-2am; Sun closed"
        val h = Hours.parse(raw)!!
        val formatted = Hours.format(h)
        assertEquals(h.days.filterValues { it.isNotEmpty() }, Hours.parse(formatted)!!.days)
        assertEquals("24h", Hours.format(Hours.parse("24h")!!))
        assertEquals("Mon 17:00-24:00", Hours.format(WeeklyHours(mapOf(DayOfWeek.MONDAY to listOf(MinuteRange(1020, 1440))))))
    }
}
