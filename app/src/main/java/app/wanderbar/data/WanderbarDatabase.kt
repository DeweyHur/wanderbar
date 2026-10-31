package app.wanderbar.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [PlanEntity::class, PlaceEntity::class], version = 1, exportSchema = false)
abstract class WanderbarDatabase : RoomDatabase() {
    abstract fun dao(): WanderbarDao

    companion object {
        fun create(context: Context): WanderbarDatabase =
            Room.databaseBuilder(context.applicationContext, WanderbarDatabase::class.java, "wanderbar.db")
                .build()
    }
}
