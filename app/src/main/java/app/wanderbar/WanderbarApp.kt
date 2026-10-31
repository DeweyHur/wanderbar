package app.wanderbar

import android.app.Application
import app.wanderbar.data.Repository
import app.wanderbar.data.WanderbarDatabase

class WanderbarApp : Application() {
    val repository: Repository by lazy { Repository(WanderbarDatabase.create(this)) }
}
