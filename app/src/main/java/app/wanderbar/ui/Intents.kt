package app.wanderbar.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import app.wanderbar.data.PlaceEntity
import app.wanderbar.domain.Links

object TeslaShare {
    /** Package of the official Tesla app on Google Play. Confirm on device in M3 (see README). */
    const val TESLA_PACKAGE = "com.teslamotors.tesla"

    fun shareText(place: PlaceEntity): String =
        Links.teslaShareText(place.name, place.address, place.mapsUrl)

    private fun baseIntent(place: PlaceEntity) = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, shareText(place))
        putExtra(Intent.EXTRA_SUBJECT, place.name)
    }

    fun isInstalled(context: Context): Boolean =
        baseIntent(PlaceEntity(planId = 0, name = "x"))
            .setPackage(TESLA_PACKAGE)
            .resolveActivity(context.packageManager) != null

    /** Sends straight to the Tesla app; falls back to the system share sheet. */
    fun send(context: Context, place: PlaceEntity) {
        val direct = baseIntent(place).setPackage(TESLA_PACKAGE)
        try {
            context.startActivity(direct)
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(context, "테슬라 앱을 찾지 못해 공유 메뉴를 열어요", Toast.LENGTH_SHORT).show()
            shareAnywhere(context, place)
        }
    }

    /** Always shows the share sheet (handy for M3 testing and for other apps). */
    fun shareAnywhere(context: Context, place: PlaceEntity) {
        context.startActivity(Intent.createChooser(baseIntent(place), "목적지 보내기"))
    }
}

fun openUrl(context: Context, url: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(context, "링크를 열 앱이 없어요", Toast.LENGTH_SHORT).show()
    }
}
