package eu.kanade.tachiyomi.extension.all.xianscan

import android.text.InputType
import androidx.preference.PreferenceScreen
import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.source.ConfigurableSource
import eu.kanade.tachiyomi.source.UnmeteredSource
import eu.kanade.tachiyomi.source.model.Filter
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.online.HttpSource
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import kotlinx.serialization.decodeFromString

class XianScan : HttpSource(), ConfigurableSource, UnmeteredSource {

    override val name = "XianScan"

    override val lang = "all"

    override val supportsLatest = true

    override val baseUrl: String
        get() {
            val pref = getPreferences(id).getString(KEY_ADDRESS, null)
            return if (!pref.isNullOrBlank()) pref.trimEnd('/') else DEFAULT_ADDRESS
        }

    private val json = XIANSCAN_JSON

    // CONFIGURABLE SERVER ADDRESS — A PHONE CANNOT REACH THE DESKTOP'S 127.0.0.1.
    override fun setupPreferenceScreen(screen: PreferenceScreen) {
        val current = getPreferences(id).getString(KEY_ADDRESS, null) ?: DEFAULT_ADDRESS
        screen.addEditTextPreference(
            title = "Server address",
            key = KEY_ADDRESS,
            default = DEFAULT_ADDRESS,
            summary = "Current: $current\n(e.g. http://192.168.100.98:8124 — no trailing slash)",
            dialogMessage = "Enter your PC's LAN IP address:\ne.g. http://192.168.100.98:8124",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI,
            validate = { it.toHttpUrlOrNull() != null && !it.endsWith("/") },
            validationMessage = "The URL is invalid, malformed, or ends with a slash",
            restartRequired = false,
        )

        val tokenSet = !getPreferences(id).getString(KEY_TOKEN, null).isNullOrBlank()
        screen.addEditTextPreference(
            title = "Access token",
            key = KEY_TOKEN,
            default = "",
            summary = if (tokenSet) "Set" else "Not set",
            dialogMessage = "Copy it from XianScan: Settings, Network & Access",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
            validate = { TOKEN_PATTERN.matches(it.trim()) },
            validationMessage = "The token is 20 to 200 letters, digits, - or _",
            restartRequired = false,
            summaryFor = { if (it.isBlank()) "Not set" else "Set" },
        )
    }

    // -- ACCESS TOKEN -- //

    // AN INTERCEPTOR (NOT headersBuilder) BECAUSE HttpSource CACHES headers; THIS WAY A NEW TOKEN
    // APPLIES WITHOUT RESTARTING THE APP. THE TOKEN ONLY GOES TO THE CONFIGURED SERVER HOST.
    override val client: OkHttpClient = network.client.newBuilder()
        .addInterceptor { chain -> authInterceptor(chain) }
        .build()

    private fun authInterceptor(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val server = baseUrl.toHttpUrlOrNull()
        val token = getPreferences(id).getString(KEY_TOKEN, null)?.trim().orEmpty()
        val isServer = server != null && request.url.host == server.host && request.url.port == server.port

        val outgoing = if (isServer && token.isNotEmpty()) {
            request.newBuilder().header(TOKEN_HEADER, token).build()
        } else {
            request
        }

        val response = chain.proceed(outgoing)
        if (isServer && response.code == 401) {
            response.close()
            throw IOException(
                "XianScan rejected the access token. Open XianScan on your computer, Settings, Network & Access, " +
                    "and paste the token into this extension's settings.",
            )
        }
        return response
    }

    // -- SEARCH / POPULAR / LATEST -- //

    override fun searchMangaRequest(page: Int, query: String, filters: FilterList): Request {
        val status = (filters.find { it is StatusFilter } as? StatusFilter)
            ?.takeIf { it.state > 0 }
            ?.let { STATUS_KEYS[it.state - 1] }

        val builder = if (query.isNotBlank()) {
            "$baseUrl/api/mihon/search".toHttpUrl().newBuilder().addQueryParameter("q", query)
        } else {
            "$baseUrl/api/mihon/library".toHttpUrl().newBuilder()
        }
        builder.addQueryParameter("page", page.toString())
        status?.let { builder.addQueryParameter("status", it) }
        return GET(builder.build(), headers)
    }

    override fun searchMangaParse(response: Response): MangasPage {
        val dto = response.parseAs<LibraryDto>()
        return MangasPage(dto.books.map { it.toSManga(baseUrl) }, dto.hasNextPage)
    }

    override fun popularMangaRequest(page: Int): Request = searchMangaRequest(page, "", FilterList())

    override fun popularMangaParse(response: Response): MangasPage = searchMangaParse(response)

    override fun latestUpdatesRequest(page: Int): Request = popularMangaRequest(page)

    override fun latestUpdatesParse(response: Response): MangasPage = popularMangaParse(response)

    // -- DETAILS -- //

    override fun mangaDetailsRequest(manga: SManga): Request = GET(baseUrl + manga.url, headers)

    override fun mangaDetailsParse(response: Response): SManga =
        response.parseAs<MangaDto>().toSManga(baseUrl)

    override fun getMangaUrl(manga: SManga): String = baseUrl + manga.url

    // -- CHAPTERS -- //

    override fun chapterListRequest(manga: SManga): Request = GET(baseUrl + manga.url + "/chapters", headers)

    override fun chapterListParse(response: Response): List<SChapter> =
        response.parseAs<ChapterListDto>().chapters
            .map { ch ->
                SChapter.create().apply {
                    url = ch.url
                    name = ch.name
                    date_upload = ch.dateUpload
                    chapter_number = ch.chapterNumber
                    scanlator = "XianScan"
                }
            }
            .sortedByDescending { it.chapter_number }

    override fun getChapterUrl(chapter: SChapter): String = baseUrl + chapter.url

    // -- PAGES -- //

    override fun pageListRequest(chapter: SChapter): Request = GET(baseUrl + chapter.url + "/pages", headers)

    override fun pageListParse(response: Response): List<Page> =
        response.parseAs<PageListDto>().pages.map { p ->
            val abs = p.imageUrl.toAbsolute(baseUrl)
            Page(p.index, url = abs, imageUrl = abs)
        }

    override fun imageRequest(page: Page): Request = GET(page.imageUrl!!, headers)

    // -- FILTERS -- //

    override fun getFilterList(): FilterList = FilterList(StatusFilter())

    private inline fun <reified T> Response.parseAs(): T = json.decodeFromString(body.string())

    companion object {
        private const val DEFAULT_ADDRESS = "http://127.0.0.1:8124"
        private const val KEY_ADDRESS = "serverAddress"
        private const val KEY_TOKEN = "accessToken"
        private const val TOKEN_HEADER = "X-XianScan-Token"
        private val TOKEN_PATTERN = Regex("^[A-Za-z0-9_-]{20,200}$")
    }
}

// SERIALIZATION-STATUS FILTER — "All" + THE SEVEN MIHON STATUS VALUES.
private class StatusFilter : Filter.Select<String>(
    "Status",
    arrayOf("All") + STATUS_KEYS.map {
        it.replace('_', ' ').replaceFirstChar { ch -> ch.uppercaseChar() }
    },
)

private val STATUS_KEYS = listOf(
    "unknown",
    "ongoing",
    "completed",
    "licensed",
    "publishing_finished",
    "cancelled",
    "on_hiatus",
)
