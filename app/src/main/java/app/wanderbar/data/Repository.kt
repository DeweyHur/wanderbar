package app.wanderbar.data

import androidx.room.withTransaction
import app.wanderbar.domain.FlowItem
import app.wanderbar.domain.PlaceStatus
import app.wanderbar.domain.PlanFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * All writes run on an app-wide scope so they survive screen navigation,
 * and are serialized so read-modify-write flow changes never interleave.
 */
class Repository(private val db: WanderbarDatabase) {
    private val dao = db.dao()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val writeLock = Mutex()

    fun observePlanSummaries(): Flow<List<PlanSummary>> = dao.observePlanSummaries()
    fun observePlan(id: Long): Flow<PlanEntity?> = dao.observePlan(id)
    fun observePlaces(planId: Long): Flow<List<PlaceEntity>> = dao.observePlaces(planId)
    fun observePlace(id: Long): Flow<PlaceEntity?> = dao.observePlace(id)
    suspend fun getPlace(id: Long): PlaceEntity? = dao.getPlace(id)

    private fun write(block: suspend () -> Unit) {
        scope.launch { writeLock.withLock { db.withTransaction { block() } } }
    }

    /** Creates a plan and reports its id on the main thread via [onCreated]. */
    fun createPlan(title: String, onCreated: (Long) -> Unit) {
        scope.launch {
            val id = writeLock.withLock { dao.insertPlan(PlanEntity(title = title.trim())) }
            launch(Dispatchers.Main) { onCreated(id) }
        }
    }

    fun renamePlan(id: Long, title: String) = write { dao.renamePlan(id, title.trim()) }
    fun deletePlan(id: Long) = write { dao.deletePlan(id) }

    /** Adds stops at the end of the plan. Names are trimmed; blanks ignored. */
    fun addPlaces(planId: Long, drafts: List<PlaceEntity>) = write {
        val existing = dao.getPlaces(planId)
        var items = existing.map { FlowItem(it.id, it.status) }
        var order = existing.size
        for (draft in drafts) {
            if (draft.name.isBlank()) continue
            val id = dao.insertPlace(
                draft.copy(id = 0, planId = planId, name = draft.name.trim(), orderIndex = order++,
                    statusName = PlaceStatus.PENDING.name),
            )
            items = PlanFlow.add(items, FlowItem(id, PlaceStatus.PENDING))
        }
        persist(items)
    }

    fun addQuick(planId: Long, commaSeparated: String) =
        addPlaces(planId, splitQuickInput(commaSeparated).map { PlaceEntity(planId = planId, name = it) })

    /** Saves edits to name/memo/address/link/hours. Never touches order or status. */
    fun updateDetails(place: PlaceEntity) = write {
        val current = dao.getPlace(place.id) ?: return@write
        dao.updatePlace(
            current.copy(
                name = place.name.trim(),
                memo = place.memo.trim(),
                address = place.address.trim(),
                mapsUrl = place.mapsUrl.trim(),
                hoursRaw = place.hoursRaw.trim(),
            ),
        )
    }

    fun deletePlace(planId: Long, placeId: Long) = write {
        val items = flowItems(planId)
        dao.deletePlace(placeId)
        persist(PlanFlow.remove(items, placeId))
    }

    fun complete(planId: Long, placeId: Long) = applyFlow(planId) { PlanFlow.complete(it, placeId) }
    fun postpone(planId: Long, placeId: Long) = applyFlow(planId) { PlanFlow.postpone(it, placeId) }
    fun drop(planId: Long, placeId: Long) = applyFlow(planId) { PlanFlow.drop(it, placeId) }
    fun setCurrent(planId: Long, placeId: Long) = applyFlow(planId) { PlanFlow.setCurrent(it, placeId) }
    fun restore(planId: Long, placeId: Long) = applyFlow(planId) { PlanFlow.restore(it, placeId) }
    fun restart(planId: Long) = applyFlow(planId) { PlanFlow.restart(it) }

    /** Persists a drag-and-drop result given as the new id order. */
    fun reorder(planId: Long, orderedIds: List<Long>) = applyFlow(planId) { items ->
        val byId = items.associateBy { it.id }
        val reordered = orderedIds.mapNotNull { byId[it] }
        // Anything not in the given order (e.g. added mid-drag) keeps its place at the end.
        reordered + items.filter { it.id !in orderedIds.toSet() }
    }

    private fun applyFlow(planId: Long, change: (List<FlowItem>) -> List<FlowItem>) = write {
        persist(change(flowItems(planId)))
    }

    private suspend fun flowItems(planId: Long): List<FlowItem> =
        dao.getPlaces(planId).map { FlowItem(it.id, it.status) }

    private suspend fun persist(items: List<FlowItem>) {
        PlanFlow.normalize(items).forEachIndexed { index, item ->
            dao.updateFlow(item.id, index, item.status.name)
        }
    }

    companion object {
        /** "카페, 공원, 저녁 재즈바" -> ["카페", "공원", "저녁 재즈바"]. Also splits on newlines and "→". */
        fun splitQuickInput(text: String): List<String> =
            text.split(',', '\n', '→', '·', '、')
                .map { it.trim() }
                .filter { it.isNotEmpty() }
    }
}
