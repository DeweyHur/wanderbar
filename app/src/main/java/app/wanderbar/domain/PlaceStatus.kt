package app.wanderbar.domain

/** Lifecycle of a stop in a plan. Stored by name in Room. */
enum class PlaceStatus {
    /** Not visited yet. */
    PENDING,

    /** The destination we're heading to now. At most one per plan. */
    CURRENT,

    /** Visited / finished. */
    DONE,

    /** Dropped for this trip ("이번엔 안 가기"). Can be restored. */
    SKIPPED,
}
