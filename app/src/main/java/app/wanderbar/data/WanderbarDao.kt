package app.wanderbar.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface WanderbarDao {

    @Query(
        """
        SELECT p.id AS id, p.title AS title, p.createdAt AS createdAt,
            (SELECT COUNT(*) FROM places WHERE planId = p.id) AS total,
            (SELECT COUNT(*) FROM places WHERE planId = p.id AND status IN ('DONE', 'SKIPPED')) AS finished,
            (SELECT name FROM places WHERE planId = p.id AND status = 'CURRENT' LIMIT 1) AS currentName
        FROM plans p
        ORDER BY p.createdAt DESC
        """
    )
    fun observePlanSummaries(): Flow<List<PlanSummary>>

    @Query("SELECT * FROM plans WHERE id = :id")
    fun observePlan(id: Long): Flow<PlanEntity?>

    @Insert
    suspend fun insertPlan(plan: PlanEntity): Long

    @Query("UPDATE plans SET title = :title WHERE id = :id")
    suspend fun renamePlan(id: Long, title: String)

    @Query("DELETE FROM plans WHERE id = :id")
    suspend fun deletePlan(id: Long)

    @Query("SELECT * FROM places WHERE planId = :planId ORDER BY orderIndex ASC, id ASC")
    fun observePlaces(planId: Long): Flow<List<PlaceEntity>>

    @Query("SELECT * FROM places WHERE planId = :planId ORDER BY orderIndex ASC, id ASC")
    suspend fun getPlaces(planId: Long): List<PlaceEntity>

    @Query("SELECT * FROM places WHERE id = :id")
    fun observePlace(id: Long): Flow<PlaceEntity?>

    @Query("SELECT * FROM places WHERE id = :id")
    suspend fun getPlace(id: Long): PlaceEntity?

    @Insert
    suspend fun insertPlace(place: PlaceEntity): Long

    @Update
    suspend fun updatePlace(place: PlaceEntity)

    @Query("DELETE FROM places WHERE id = :id")
    suspend fun deletePlace(id: Long)

    @Query("UPDATE places SET orderIndex = :orderIndex, status = :status WHERE id = :id")
    suspend fun updateFlow(id: Long, orderIndex: Int, status: String)
}
