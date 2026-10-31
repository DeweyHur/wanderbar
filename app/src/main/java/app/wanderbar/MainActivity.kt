package app.wanderbar

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.wanderbar.data.Repository
import app.wanderbar.domain.SharedPlace
import app.wanderbar.domain.SharedText
import app.wanderbar.ui.PlaceDetailScreen
import app.wanderbar.ui.PlaceEditScreen
import app.wanderbar.ui.PlanScreen
import app.wanderbar.ui.PlansScreen
import app.wanderbar.ui.WanderbarTheme

class MainActivity : ComponentActivity() {

    /** A place shared in from Google Maps, waiting for the user to pick a plan. */
    private val pendingShare = mutableStateOf<SharedPlace?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) handleShare(intent)
        val repository = (application as WanderbarApp).repository
        setContent {
            WanderbarTheme {
                WanderbarNav(repository, pendingShare)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    private fun handleShare(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND || intent.type?.startsWith("text/") != true) return
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
        val parsed = SharedText.parse(text, subject)
        if (parsed.name.isNotBlank() || parsed.mapsUrl != null) pendingShare.value = parsed
    }
}

private object Routes {
    const val PLANS = "plans"
    const val PLAN = "plan/{planId}"
    const val PLACE = "place/{placeId}"
    const val EDIT = "edit/{planId}?placeId={placeId}&shared={shared}"

    fun plan(id: Long) = "plan/$id"
    fun place(id: Long) = "place/$id"
    fun edit(planId: Long, placeId: Long? = null, shared: Boolean = false) =
        "edit/$planId?placeId=${placeId ?: -1L}&shared=$shared"
}

@Composable
private fun WanderbarNav(repository: Repository, pendingShare: MutableState<SharedPlace?>) {
    val nav = rememberNavController()
    val share by pendingShare

    // A new share always lands on the plan picker.
    LaunchedEffect(share) {
        if (share != null) {
            nav.navigate(Routes.PLANS) {
                popUpTo(Routes.PLANS) { inclusive = true }
                launchSingleTop = true
            }
        }
    }

    NavHost(navController = nav, startDestination = Routes.PLANS) {
        composable(Routes.PLANS) {
            PlansScreen(
                repository = repository,
                pendingShare = share,
                onCancelShare = { pendingShare.value = null },
                onOpenPlan = { planId ->
                    if (pendingShare.value != null) nav.navigate(Routes.edit(planId, shared = true))
                    else nav.navigate(Routes.plan(planId))
                },
            )
        }
        composable(
            Routes.PLAN,
            arguments = listOf(navArgument("planId") { type = NavType.LongType }),
        ) { entry ->
            val planId = requireNotNull(entry.arguments).getLong("planId")
            PlanScreen(
                repository = repository,
                planId = planId,
                onBack = { nav.popBackStack() },
                onOpenPlace = { nav.navigate(Routes.place(it)) },
                onAddDetailed = { nav.navigate(Routes.edit(planId)) },
            )
        }
        composable(
            Routes.PLACE,
            arguments = listOf(navArgument("placeId") { type = NavType.LongType }),
        ) { entry ->
            val placeId = requireNotNull(entry.arguments).getLong("placeId")
            PlaceDetailScreen(
                repository = repository,
                placeId = placeId,
                onBack = { nav.popBackStack() },
                onEdit = { planId, id -> nav.navigate(Routes.edit(planId, id)) },
            )
        }
        composable(
            Routes.EDIT,
            arguments = listOf(
                navArgument("planId") { type = NavType.LongType },
                navArgument("placeId") { type = NavType.LongType; defaultValue = -1L },
                navArgument("shared") { type = NavType.BoolType; defaultValue = false },
            ),
        ) { entry ->
            val args = requireNotNull(entry.arguments)
            val planId = args.getLong("planId")
            val placeId = args.getLong("placeId").takeIf { it > 0 }
            val fromShare = args.getBoolean("shared")
            // Take the shared place once; the edit screen keeps its own saved state afterwards.
            val prefill = remember { if (fromShare) pendingShare.value else null }
            LaunchedEffect(Unit) { if (fromShare) pendingShare.value = null }
            PlaceEditScreen(
                repository = repository,
                planId = planId,
                placeId = placeId,
                prefill = prefill,
                onDone = {
                    if (fromShare) {
                        nav.navigate(Routes.plan(planId)) { popUpTo(Routes.PLANS) }
                    } else {
                        nav.popBackStack()
                    }
                },
            )
        }
    }
}
