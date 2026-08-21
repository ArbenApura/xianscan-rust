package eu.kanade.tachiyomi.extension.all.xianscan

import android.app.Application
import android.content.SharedPreferences
import eu.kanade.tachiyomi.source.online.HttpSource
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get

// THE MIHON HOST REGISTERS THE APPLICATION INTO INJEKT AT STARTUP — EXTENSIONS READ IT HERE.
// (THIS IS THE SAME PATTERN AS keiyoushi.utils.Context.kt.)
val applicationContext: Application = Injekt.get()

// PREFERENCES ARE SCOPED PER SOURCE ID (source_<id>), MATCHING THE HOST APP'S OWN SCHEME.
fun getPreferences(sourceId: Long): SharedPreferences =
    applicationContext.getSharedPreferences("source_$sourceId", 0)

// LAZY PREFERENCE ACCESSOR FOR BASE-URL-STYLE STRING SETTINGS.
inline fun HttpSource.stringPreferenceLazy(
    key: String,
    default: String,
    crossinline cleanup: (String) -> String = { it.trimEnd('/') },
) = lazy {
    cleanup(getPreferences(id).getString(key, null) ?: default)
}
