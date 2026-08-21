package eu.kanade.tachiyomi.extension.all.xianscan

import eu.kanade.tachiyomi.source.model.SManga
import kotlinx.serialization.Serializable

@Serializable
data class MangaDto(
    val id: String,
    val url: String,
    val title: String,
    val author: String? = null,
    val artist: String? = null,
    val description: String? = null,
    val genre: String? = null,
    val status: String = "unknown",
    val thumbnailUrl: String? = null,
)

@Serializable
data class LibraryDto(
    val books: List<MangaDto>,
    val hasNextPage: Boolean = false,
)

@Serializable
data class ChapterDto(
    val url: String,
    val name: String,
    val dateUpload: Long = 0L,
    val chapterNumber: Float = 0f,
)

@Serializable
data class ChapterListDto(
    val chapters: List<ChapterDto>,
)

@Serializable
data class PageDto(
    val index: Int,
    val imageUrl: String,
)

@Serializable
data class PageListDto(
    val pages: List<PageDto>,
)

// MAP THE SERVER DTO ONTO THE SMANGA MODEL THAT MIHON DISPLAYS.
fun MangaDto.toSManga(baseUrl: String): SManga = SManga.create().apply {
    url = this@toSManga.url
    title = this@toSManga.title
    thumbnail_url = this@toSManga.thumbnailUrl?.toAbsolute(baseUrl)
    author = this@toSManga.author
    artist = this@toSManga.artist
    description = this@toSManga.description
    genre = this@toSManga.genre
    status = when (this@toSManga.status) {
        "ongoing" -> SManga.ONGOING
        "completed" -> SManga.COMPLETED
        "licensed" -> SManga.LICENSED
        "publishing_finished" -> SManga.PUBLISHING_FINISHED
        "cancelled" -> SManga.CANCELLED
        "on_hiatus" -> SManga.ON_HIATUS
        else -> SManga.UNKNOWN
    }
    initialized = true
}

// SERVER URLS ARE RELATIVE — RESOLVE THEM AGAINST THE CONFIGURED BASE URL.
fun String.toAbsolute(baseUrl: String): String =
    if (startsWith("http://") || startsWith("https://")) this else baseUrl + this
