package app.wanderbar.domain

import app.wanderbar.domain.PlaceStatus.CURRENT
import app.wanderbar.domain.PlaceStatus.DONE
import app.wanderbar.domain.PlaceStatus.PENDING
import app.wanderbar.domain.PlaceStatus.SKIPPED
import org.junit.Assert.assertEquals
import org.junit.Test

class PlanFlowTest {
    private fun plan(vararg s: PlaceStatus) = s.mapIndexed { i, st -> FlowItem(i + 1L, st) }
    private fun List<FlowItem>.ids() = map { it.id }
    private fun List<FlowItem>.st() = map { it.status }

    @Test fun firstAddedBecomesCurrent() {
        val p = PlanFlow.add(emptyList(), FlowItem(1, PENDING))
        assertEquals(listOf(CURRENT), p.st())
        val p2 = PlanFlow.add(p, FlowItem(2, PENDING))
        assertEquals(listOf(CURRENT, PENDING), p2.st())
    }

    @Test fun completeMovesToNext() {
        val p = PlanFlow.complete(plan(CURRENT, PENDING, PENDING), 1)
        assertEquals(listOf(DONE, CURRENT, PENDING), p.st())
    }

    @Test fun completeWrapsToEarlierPending() {
        val p = PlanFlow.complete(plan(PENDING, DONE, CURRENT), 3)
        assertEquals(listOf(CURRENT, DONE, DONE), p.st())
    }

    @Test fun completeLastLeavesNoCurrent() {
        val p = PlanFlow.complete(plan(DONE, CURRENT), 2)
        assertEquals(listOf(DONE, DONE), p.st())
    }

    @Test fun postponeMovesToEndAndAdvances() {
        val p = PlanFlow.postpone(plan(DONE, CURRENT, PENDING, PENDING), 2)
        assertEquals(listOf(1L, 3L, 4L, 2L), p.ids())
        assertEquals(listOf(DONE, CURRENT, PENDING, PENDING), p.st())
    }

    @Test fun postponeOnlyRemainingStaysCurrent() {
        val p = PlanFlow.postpone(plan(DONE, CURRENT, DONE), 2)
        assertEquals(listOf(1L, 3L, 2L), p.ids())
        assertEquals(listOf(DONE, DONE, CURRENT), p.st())
    }

    @Test fun dropSkipsAndAdvances() {
        val p = PlanFlow.drop(plan(CURRENT, PENDING), 1)
        assertEquals(listOf(SKIPPED, CURRENT), p.st())
    }

    @Test fun setCurrentDemotesOld() {
        val p = PlanFlow.setCurrent(plan(CURRENT, PENDING, PENDING), 3)
        assertEquals(listOf(PENDING, PENDING, CURRENT), p.st())
    }

    @Test fun restoreWhenNothingCurrentPromotes() {
        val p = PlanFlow.restore(plan(DONE, SKIPPED), 2)
        assertEquals(listOf(DONE, CURRENT), p.st())
    }

    @Test fun removeCurrentPromotesFollowing() {
        val p = PlanFlow.remove(plan(PENDING, CURRENT, PENDING), 2)
        assertEquals(listOf(1L, 3L), p.ids())
        assertEquals(listOf(PENDING, CURRENT), p.st())
    }

    @Test fun moveKeepsStatuses() {
        val p = PlanFlow.move(plan(CURRENT, PENDING, PENDING), 0, 2)
        assertEquals(listOf(2L, 3L, 1L), p.ids())
        assertEquals(listOf(PENDING, PENDING, CURRENT), p.st())
    }

    @Test fun normalizeFixesDoubleCurrent() {
        val p = PlanFlow.normalize(plan(CURRENT, CURRENT))
        assertEquals(listOf(CURRENT, PENDING), p.st())
    }

    @Test fun restartResetsAll() {
        val p = PlanFlow.restart(plan(DONE, SKIPPED, CURRENT))
        assertEquals(listOf(CURRENT, PENDING, PENDING), p.st())
    }
}
