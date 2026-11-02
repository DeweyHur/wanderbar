package app.wanderbar.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [PlanEntity::class, PlaceEntity::class], version = 2, exportSchema = false)
abstract class WanderbarDatabase : RoomDatabase() {
    abstract fun dao(): WanderbarDao

    companion object {
        fun create(context: Context): WanderbarDatabase =
            Room.databaseBuilder(context.applicationContext, WanderbarDatabase::class.java, "wanderbar.db")
                .addMigrations(MIGRATION_1_2)
                .build()

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE places ADD COLUMN lat REAL")
                db.execSQL("ALTER TABLE places ADD COLUMN lng REAL")
                db.execSQL("ALTER TABLE places ADD COLUMN googlePlaceId TEXT NOT NULL DEFAULT ''")
            }
        }
    }
}
