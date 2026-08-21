package eu.kanade.tachiyomi.extension.all.xianscan

import eu.kanade.tachiyomi.source.SourceFactory

// THE HOST DISCOVERS THIS CLASS BY DEX-SCANNING FOR SourceFactory IMPLEMENTATIONS.
class XianScanFactory : SourceFactory {
    override fun createSources() = listOf(XianScan())
}
