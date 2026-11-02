package app.wanderbar.domain

import java.time.DayOfWeek
import java.time.LocalDateTime
import java.time.LocalTime

/** Minutes since midnight. end may be <= start for ranges that run past midnight. */
data class MinuteRange(val start: Int, val end: Int) {
    val overnight: Boolean get() = end <= start
}

/**
 * Weekly opening hours. A day that is absent from [days] is closed.
 * Days mapped to an empty list are explicitly closed.
 */
data class WeeklyHours(val days: Map<DayOfWeek, List<MinuteRange>>)

sealed interface HoursStatus {
    /** [closesAt] is null when the place is open around the clock. */
    data class Open(val closesAt: LocalTime?) : HoursStatus
    data class ClosingSoon(val closesAt: LocalTime, val minutesLeft: Int) : HoursStatus
    /** [opensAt] is the next opening later today, if any. */
    data class Closed(val opensAt: LocalTime?) : HoursStatus
    data object Unknown : HoursStatus
}

/**
 * Parses free-form hours the user types or pastes, e.g.
 *   "09:00-22:00"                       (every day)
 *   "Mon-Fri 9:00-18:00; Sat 10-14; Sun closed"
 *   "월-금 11:00-14:00 17:00-22:00, 토 12:00-23:00, 일 휴무"
 *   "Fri-Sat 6pm-2am", "24h", "매일 24시간"
 */
object Hours {
    const val CLOSING_SOON_MINUTES = 60

    private const val DAY_WORD =
        "monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun|" +
            "월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일"
    private const val TIME = """(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?"""
    private const val DASH = """\s*(?:-|~|–|—|to)\s*"""

    private val tokenRegex = Regex(
        listOf(
            "(?<all>매일|everyday|every\\s*day|daily|all\\s*week)",
            "(?<weekdays>평일|weekdays?)",
            "(?<weekend>주말|weekends?)",
            "(?<h24>24\\s*h(?:ours|rs)?|24/7|24시간|open\\s*24)",
            "(?<closed>closed|휴무|휴일|정기휴무|닫음)",
            "(?<time>$TIME$DASH$TIME)",
            "(?<day>(?:$DAY_WORD)(?:$DASH(?:$DAY_WORD))?)",
        ).joinToString("|"),
        RegexOption.IGNORE_CASE,
    )
    private val dayWordRegex = Regex(DAY_WORD, RegexOption.IGNORE_CASE)
    private val timeRegex = Regex("$TIME$DASH$TIME", RegexOption.IGNORE_CASE)

    fun parse(raw: String?): WeeklyHours? {
        // Google formats times with narrow/no-break spaces ("9:00\u202fAM").
        val text = raw?.replace(Regex("[\u00a0\u2007\u2009\u202f]"), " ")?.trim()?.lowercase().orEmpty()
        if (text.isEmpty()) return null

        val result = linkedMapOf<DayOfWeek, MutableList<MinuteRange>>()
        var currentDays = linkedSetOf<DayOfWeek>()
        var lastWasDay = false
        var sawAnything = false

        fun targetDays(): Set<DayOfWeek> = currentDays.ifEmpty { DayOfWeek.entries.toSet() }
        fun addDays(days: Collection<DayOfWeek>) {
            if (!lastWasDay) currentDays = linkedSetOf()
            currentDays.addAll(days)
            lastWasDay = true
        }
        fun addRange(r: MinuteRange) {
            targetDays().forEach { result.getOrPut(it) { mutableListOf() }.add(r) }
            lastWasDay = false
            sawAnything = true
        }

        for (m in tokenRegex.findAll(text)) {
            val g = m.groups
            when {
                g["all"] != null -> addDays(DayOfWeek.entries)
                g["weekdays"] != null -> addDays(DayOfWeek.entries.take(5))
                g["weekend"] != null -> addDays(listOf(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY))
                g["h24"] != null -> addRange(MinuteRange(0, 24 * 60))
                g["closed"] != null -> {
                    targetDays().forEach { result[it] = mutableListOf() }
                    lastWasDay = false
                    sawAnything = true
                }
                g["time"] != null -> parseTimeRange(m.value)?.let(::addRange)
                g["day"] != null -> addDays(parseDayRange(m.value))
            }
        }
        if (!sawAnything) return null
        return WeeklyHours(result.mapValues { it.value.toList() })
    }

    fun status(hours: WeeklyHours?, now: LocalDateTime): HoursStatus {
        if (hours == null) return HoursStatus.Unknown
        val t = now.hour * 60 + now.minute
        val today = hours.days[now.dayOfWeek].orEmpty()
        val yesterday = hours.days[now.dayOfWeek.minus(1)].orEmpty()

        var minutesLeft: Int? = null
        var closesAtMin = 0
        fun consider(left: Int, closeMin: Int) {
            if (minutesLeft == null || left > minutesLeft!!) {
                minutesLeft = left
                closesAtMin = closeMin
            }
        }
        if (today.any { it.start == 0 && it.end == 24 * 60 }) return HoursStatus.Open(null)
        for (r in today) {
            if (!r.overnight && t >= r.start && t < r.end) consider(r.end - t, r.end)
            if (r.overnight && t >= r.start) consider(24 * 60 - t + r.end, r.end)
        }
        for (r in yesterday) {
            if (r.overnight && t < r.end) consider(r.end - t, r.end)
        }

        val left = minutesLeft
        if (left != null) {
            val closesAt = minutesToTime(closesAtMin)
            return if (left <= CLOSING_SOON_MINUTES) HoursStatus.ClosingSoon(closesAt, left)
            else HoursStatus.Open(closesAt)
        }
        val nextOpen = today.map { it.start }.filter { it > t }.minOrNull()
        return HoursStatus.Closed(nextOpen?.let(::minutesToTime))
    }

    fun status(raw: String?, now: LocalDateTime): HoursStatus = status(parse(raw), now)

    /**
     * Inverse of [parse]: a compact string the user can read and edit, e.g.
     * "Mon 11:00-14:00 17:00-22:00; Tue 11:00-22:00". Days without ranges are omitted (closed).
     */
    fun format(hours: WeeklyHours): String {
        val allDay = MinuteRange(0, 24 * 60)
        if (DayOfWeek.entries.all { hours.days[it] == listOf(allDay) }) return "24h"
        return DayOfWeek.entries
            .mapNotNull { day ->
                val ranges = hours.days[day].orEmpty()
                if (ranges.isEmpty()) null
                else ENGLISH_DAY[day] + " " + ranges.joinToString(" ") { "${hhmm(it.start)}-${hhmm(it.end)}" }
            }
            .joinToString("; ")
    }

    private val ENGLISH_DAY = mapOf(
        DayOfWeek.MONDAY to "Mon", DayOfWeek.TUESDAY to "Tue", DayOfWeek.WEDNESDAY to "Wed",
        DayOfWeek.THURSDAY to "Thu", DayOfWeek.FRIDAY to "Fri", DayOfWeek.SATURDAY to "Sat",
        DayOfWeek.SUNDAY to "Sun",
    )

    private fun hhmm(min: Int): String = "%02d:%02d".format(min / 60, min % 60)

    private fun minutesToTime(min: Int): LocalTime = LocalTime.of((min / 60) % 24, min % 60)

    private fun parseTimeRange(s: String): MinuteRange? {
        val m = timeRegex.find(s) ?: return null
        val v = m.groupValues
        val start = toMinutes(v[1], v[2], v[3], isEnd = false) ?: return null
        val end = toMinutes(v[4], v[5], v[6], isEnd = true) ?: return null
        if (start == end) return MinuteRange(0, 24 * 60)
        return MinuteRange(start, end)
    }

    private fun toMinutes(h: String, m: String, meridiem: String, isEnd: Boolean): Int? {
        var hour = h.toIntOrNull() ?: return null
        val minute = m.ifEmpty { "0" }.toIntOrNull() ?: return null
        if (minute > 59) return null
        val mer = meridiem.replace(".", "")
        when (mer) {
            "am" -> if (hour == 12) hour = 0
            "pm" -> if (hour < 12) hour += 12
        }
        if (hour > 24 || (hour == 24 && minute > 0)) return null
        if (hour == 24 && !isEnd) return null
        // A bare "0:00" as end means midnight -> treat as 24:00 so it isn't an overnight range.
        val total = hour * 60 + minute
        return if (isEnd && total == 0) 24 * 60 else total
    }

    private fun parseDayRange(s: String): List<DayOfWeek> {
        val words = dayWordRegex.findAll(s).map { it.value }.toList()
        val first = words.firstOrNull()?.let(::dayOf) ?: return emptyList()
        val last = words.getOrNull(1)?.let(::dayOf) ?: return listOf(first)
        val out = mutableListOf(first)
        var d = first
        while (d != last) {
            d = d.plus(1)
            out += d
        }
        return out
    }

    private fun dayOf(word: String): DayOfWeek? {
        val w = word.lowercase()
        return when {
            w.startsWith("mon") || w.startsWith("월") -> DayOfWeek.MONDAY
            w.startsWith("tue") || w.startsWith("화") -> DayOfWeek.TUESDAY
            w.startsWith("wed") || w.startsWith("수") -> DayOfWeek.WEDNESDAY
            w.startsWith("thu") || w.startsWith("목") -> DayOfWeek.THURSDAY
            w.startsWith("fri") || w.startsWith("금") -> DayOfWeek.FRIDAY
            w.startsWith("sat") || w.startsWith("토") -> DayOfWeek.SATURDAY
            w.startsWith("sun") || w.startsWith("일") -> DayOfWeek.SUNDAY
            else -> null
        }
    }
}
