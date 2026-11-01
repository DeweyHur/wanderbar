package app.wanderbar.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import app.wanderbar.data.PlaceEntity
import app.wanderbar.domain.Links
import app.wanderbar.domain.TeslaFormat

object TeslaShare {
    /** Package of the official Tesla app on Google Play. */
    const val TESLA_PACKAGE = "com.teslamotors.tesla"

    private const val PREFS = "wanderbar"
    private const val KEY_FORMAT = "tesla_format"

    fun preferredFormat(context: Context): TeslaFormat {
        val saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_FORMAT, null)
        return TeslaFormat.entries.firstOrNull { it.name == saved } ?: TeslaFormat.ADDRESS
    }

    fun setPreferredFormat(context: Context, format: TeslaFormat) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_FORMAT, format.name).apply()
    }

    fun shareText(place: PlaceEntity, format: TeslaFormat): String? =
        Links.teslaShareText(format, place.name, place.address, place.mapsUrl, place.lat, place.lng)

    /** Preferred format, falling back through the others when it can't be built for this place. */
    fun shareText(context: Context, place: PlaceEntity): String {
        val preferred = preferredFormat(context)
        return (listOf(preferred) + TeslaFormat.entries).firstNotNullOfOrNull { shareText(place, it) } ?: place.name
    }

    private fun textIntent(text: String) = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }

    /** Sends straight to the Tesla app; falls back to the system share sheet. */
    fun send(context: Context, place: PlaceEntity) = sendText(context, shareText(context, place))

    fun sendText(context: Context, text: String) {
        try {
            context.startActivity(textIntent(text).setPackage(TESLA_PACKAGE))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(context, "테슬라 앱을 찾지 못해 공유 메뉴를 열어요", Toast.LENGTH_SHORT).show()
            shareAnywhere(context, text)
        }
    }

    /** Always shows the share sheet. */
    fun shareAnywhere(context: Context, text: String) {
        context.startActivity(Intent.createChooser(textIntent(text), "목적지 보내기"))
    }
}

fun openUrl(context: Context, url: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(context, "링크를 열 앱이 없어요", Toast.LENGTH_SHORT).show()
    }
}
