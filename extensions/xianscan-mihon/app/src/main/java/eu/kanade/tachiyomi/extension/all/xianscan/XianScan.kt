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
import okhttp3.Request
import okhttp3.Response
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

class XianScan : HttpSource(), ConfigurableSource, UnmeteredSource {

    override val name = "XianScan"

    override val lang = "all"

    override val supportsLatest = true

    override val baseUrl: String by stringPreferenceLazy(KEY_ADDRESS, DEFAULT_ADDRESS)

    private val json = Json { ignoreUnknownKeys = true }

    // CONFIGURABLE SERVER ADDRESS — A PHONE CANNOT REACH THE DESKTOP'S 127.0.0.1.
    override fun setupPreferenceScreen(screen: PreferenceScreen) {
        screen.addEditTextPreference(
            title = "Server address",
            key = KEY_ADDRESS,
            default = DEFAULT_ADDRESS,
            summary = "XianScan server URL — no trailing slash",
            dialogMessage = "e.g. http://192.168.1.20:8124",
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI,
            validate = { it.toHttpUrlOrNull() != null && !it.endsWith("/") },
            validationMessage = "The URL is invalid, malformed, or ends with a slash",
            restartRequired = true,
        )
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
