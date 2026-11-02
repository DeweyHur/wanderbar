package app.wanderbar.domain

/** Minimal view of a stop for flow decisions. The list order IS the plan order. */
data class FlowItem(val id: Long, val status: PlaceStatus)

/**
 * The "naive scheduler": ordered stops, exactly one CURRENT while anything is pending.
 * Every function takes the plan in order and returns the new plan in order.
 * Callers persist positions as orderIndex and the statuses as given.
 */
object PlanFlow {

    /** Guarantees at most one CURRENT, and one CURRENT whenever any PENDING exists. */
    fun normalize(items: List<FlowItem>): List<FlowItem> {
        var seenCurrent = false
        val fixed = items.map {
            if (it.status == PlaceStatus.CURRENT) {
                if (seenCurrent) it.copy(status = PlaceStatus.PENDING) else it.also { seenCurrent = true }
            } else it
        }
        return if (seenCurrent) fixed else promoteNext(fixed, 0)
    }

    fun add(items: List<FlowItem>, newItem: FlowItem): List<FlowItem> =
        normalize(items + newItem.copy(status = PlaceStatus.PENDING))

    fun remove(items: List<FlowItem>, id: Long): List<FlowItem> {
        val index = items.indexOfFirst { it.id == id }
        if (index < 0) return items
        val wasCurrent = items[index].status == PlaceStatus.CURRENT
        val rest = items.toMutableList().apply { removeAt(index) }
        return if (wasCurrent) promoteNext(rest, index) else normalize(rest)
    }

    /** "완료": mark done, next pending after it becomes current (wrapping to the top). */
    fun complete(items: List<FlowItem>, id: Long): List<FlowItem> {
        val index = items.indexOfFirst { it.id == id }
        if (index < 0) return items
        val updated = items.toMutableList()
        val wasCurrent = updated[index].status == PlaceStatus.CURRENT
        updated[index] = updated[index].copy(status = PlaceStatus.DONE)
        return if (wasCurrent) promoteNext(updated, index + 1) else normalize(updated)
    }

    /** "건너뛰기": push this stop to the end of the list as pending, move on to the next one. */
    fun postpone(items: List<FlowItem>, id: Long): List<FlowItem> {
        val index = items.indexOfFirst { it.id == id }
        if (index < 0) return items
        val item = items[index]
        val wasCurrent = item.status == PlaceStatus.CURRENT
        val updated = items.toMutableList().apply {
            removeAt(index)
            add(item.copy(status = PlaceStatus.PENDING))
        }
        // The element that followed the postponed one now sits at `index`.
        return if (wasCurrent) promoteNext(updated, index) else normalize(updated)
    }

    /** "이번엔 안 가기": drop for this trip, keep it visible (dimmed). */
    fun drop(items: List<FlowItem>, id: Long): List<FlowItem> {
        val index = items.indexOfFirst { it.id == id }
        if (index < 0) return items
        val updated = items.toMutableList()
        val wasCurrent = updated[index].status == PlaceStatus.CURRENT
        updated[index] = updated[index].copy(status = PlaceStatus.SKIPPED)
        return if (wasCurrent) promoteNext(updated, index + 1) else normalize(updated)
    }

    /** Jump straight to a stop ("지금 여기로"). Any previous current goes back to pending. */
    fun setCurrent(items: List<FlowItem>, id: Long): List<FlowItem> {
        if (items.none { it.id == id }) return items
        return items.map {
            when {
                it.id == id -> it.copy(status = PlaceStatus.CURRENT)
                it.status == PlaceStatus.CURRENT -> it.copy(status = PlaceStatus.PENDING)
                else -> it
            }
        }
    }

    /** Bring a done/skipped stop back as pending. */
    fun restore(items: List<FlowItem>, id: Long): List<FlowItem> =
        normalize(items.map { if (it.id == id) it.copy(status = PlaceStatus.PENDING) else it })

    /** Drag-and-drop reorder. Statuses are untouched. */
    fun move(items: List<FlowItem>, from: Int, to: Int): List<FlowItem> {
        if (from !in items.indices || to !in items.indices || from == to) return items
        return items.toMutableList().apply { add(to, removeAt(from)) }
    }

    /** Reset the whole plan for another run: everything pending, first one current. */
    fun restart(items: List<FlowItem>): List<FlowItem> =
        normalize(items.map { it.copy(status = PlaceStatus.PENDING) })

    /** Clears any CURRENT, then promotes the first PENDING at or after [start], wrapping around. */
    private fun promoteNext(items: List<FlowItem>, start: Int): List<FlowItem> {
        val cleared = items.map {
            if (it.status == PlaceStatus.CURRENT) it.copy(status = PlaceStatus.PENDING) else it
        }
        if (cleared.isEmpty()) return cleared
        val n = cleared.size
        val from = start.coerceIn(0, n)
        val target = (0 until n)
            .map { (from + it) % n }
            .firstOrNull { cleared[it].status == PlaceStatus.PENDING }
            ?: return cleared
        return cleared.mapIndexed { i, it -> if (i == target) it.copy(status = PlaceStatus.CURRENT) else it }
    }
}
