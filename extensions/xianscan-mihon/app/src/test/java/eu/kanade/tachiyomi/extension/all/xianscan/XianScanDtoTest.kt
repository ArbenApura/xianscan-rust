package eu.kanade.tachiyomi.extension.all.xianscan

import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// DTO DECODING AND URL RESOLUTION: THE ONLY LOGIC THAT RUNS WITHOUT THE HOST APP (FEAT-005 PHASE 9).
// toSManga IS NOT TESTED: SManga.create() IS A STUB THAT THROWS OFF-DEVICE.
class XianScanDtoTest {
    @Test
    fun libraryDto_ignoresUnknownKeys() {
        val json = """{"books":[{"id":"1","url":"/api/mihon/manga/1","title":"T","extra":1}],"hasNextPage":true,"x":0}"""
        val dto = XIANSCAN_JSON.decodeFromString<LibraryDto>(json)
        assertEquals(1, dto.books.size)
        assertEquals("T", dto.books[0].title)
        assertTrue(dto.hasNextPage)
    }

    @Test
    fun mangaDto_defaults() {
        val dto = XIANSCAN_JSON.decodeFromString<MangaDto>("""{"id":"2","url":"/m/2","title":"Two"}""")
        assertNull(dto.author)
        assertNull(dto.artist)
        assertNull(dto.description)
        assertNull(dto.genre)
        assertNull(dto.thumbnailUrl)
        assertEquals("unknown", dto.status)
    }

    @Test
    fun chapterDto_defaults() {
        val dto = XIANSCAN_JSON.decodeFromString<ChapterDto>("""{"url":"/c/1","name":"Chapter 1"}""")
        assertEquals(0L, dto.dateUpload)
        assertEquals(0f, dto.chapterNumber)
    }

    @Test
    fun pageListDto_decodes() {
        val dto = XIANSCAN_JSON.decodeFromString<PageListDto>("""{"pages":[{"index":3,"imageUrl":"/img/3.webp"}]}""")
        assertEquals(3, dto.pages[0].index)
        assertEquals("/img/3.webp", dto.pages[0].imageUrl)
    }

    @Test
    fun toAbsolute_keepsAbsoluteUrls() {
        assertEquals("https://cdn.example/a.webp", "https://cdn.example/a.webp".toAbsolute("http://host:8124"))
        assertEquals("http://x/a", "http://x/a".toAbsolute("http://host:8124"))
    }

    @Test
    fun toAbsolute_prefixesRelativeUrls() {
        assertEquals("http://host:8124/api/p/1", "/api/p/1".toAbsolute("http://host:8124"))
    }
}
