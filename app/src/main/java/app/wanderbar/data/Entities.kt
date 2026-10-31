package app.wanderbar.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import app.wanderbar.domain.PlaceStatus

@Entity(tableName = "plans")
data class PlanEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val createdAt: Long = System.currentTimeMillis(),
)

@Entity(
    tableName = "places",
    foreignKeys = [
        ForeignKey(
            entity = PlanEntity::class,
            parentColumns = ["id"],
            childColumns = ["planId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("planId")],
)
data class PlaceEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val planId: Long,
    val name: String,
    val memo: String = "",
    val address: String = "",
    /** A Google Maps link the user pasted or shared in (e.g. maps.app.goo.gl/...). */
    val mapsUrl: String = "",
    /** Free-form opening hours, parsed by [app.wanderbar.domain.Hours]. */
    val hoursRaw: String = "",
    val orderIndex: Int = 0,
    /** Coordinates, when the place came from Google search. Needed for the map. */
    val lat: Double? = null,
    val lng: Double? = null,
    @ColumnInfo(defaultValue = "") val googlePlaceId: String = "",
    @ColumnInfo(name = "status") val statusName: String = PlaceStatus.PENDING.name,
)

/** Kept outside the entity so Room never mistakes it for a column. */
val PlaceEntity.status: PlaceStatus
    get() = runCatching { PlaceStatus.valueOf(statusName) }.getOrDefault(PlaceStatus.PENDING)

/** Row for the plan list screen. */
data class PlanSummary(
    val id: Long,
    val title: String,
    val createdAt: Long,
    val total: Int,
    val finished: Int,
    val currentName: String?,
)

val PlaceEntity.hasLocation: Boolean get() = lat != null && lng != null
