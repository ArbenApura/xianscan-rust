// VERSION CHECK ENDPOINT — RETRIEVES CURRENT INSTALLED VERSION AND CHECKS GITHUB RELEASES
import { json } from '@sveltejs/kit';
import { isNewerVersion, compareSemver } from '$lib/utils/semver';
import { createPipelineClient } from '$lib/server/pipeline-client';
import type { RequestHandler } from './$types';

// IN-MEMORY CACHE FOR GITHUB LATEST RELEASE TO PREVENT RATE LIMITING
interface ReleaseCache {
	latest_version: string;
	release_url: string;
	release_name: string;
	published_at: string;
	body: string;
	timestamp: number;
}

let cachedRelease: ReleaseCache | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 HOUR CACHE
const GITHUB_REPO = 'ArbenApura/xianscan-rust';
const FALLBACK_CURRENT_VERSION = '0.5.0-beta.1';

export const GET: RequestHandler = async ({ url }) => {
	const force = url.searchParams.get('force') === 'true';

	// 1. DETERMINE CURRENT LOCAL RUNTIME VERSION
	let currentVersion = FALLBACK_CURRENT_VERSION;
	let webBuildHash = 'dev';

	try {
		const pipeline = createPipelineClient();
		if (pipeline.getHardware) {
			const hw = await pipeline.getHardware();
			if (hw.version) currentVersion = hw.version;
			if (hw.web_build_hash) webBuildHash = hw.web_build_hash;
		}
	} catch {
		// FALLBACK TO BUILT-IN VERSION
	}

	const now = Date.now();

	// 2. CHECK CACHE UNLESS FORCE REFRESH REQUESTED
	if (!force && cachedRelease && now - cachedRelease.timestamp < CACHE_TTL_MS) {
		const hasUpdate = isNewerVersion(currentVersion, cachedRelease.latest_version);
		return json({
			current_version: currentVersion,
			web_build_hash: webBuildHash,
			latest_version: cachedRelease.latest_version,
			has_update: hasUpdate,
			release_url: cachedRelease.release_url,
			release_name: cachedRelease.release_name,
			published_at: cachedRelease.published_at,
			body: cachedRelease.body,
			cached: true,
		});
	}

	// 3. QUERY GITHUB RELEASES & TAGS API (CATCHES BOTH FULL RELEASES AND RECENT TAGS)
	try {
		const [releasesRes, tagsRes] = await Promise.allSettled([
			fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=15`, {
				headers: {
					Accept: 'application/vnd.github.v3+json',
					'User-Agent': 'XianScan-Update-Checker',
				},
			}),
			fetch(`https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=15`, {
				headers: {
					Accept: 'application/vnd.github.v3+json',
					'User-Agent': 'XianScan-Update-Checker',
				},
			}),
		]);

		const candidates: Array<{
			version: string;
			url: string;
			name: string;
			published_at: string;
			body: string;
		}> = [];

		// PARSE RELEASES
		if (releasesRes.status === 'fulfilled' && releasesRes.value.ok) {
			const releases = await releasesRes.value.json();
			if (Array.isArray(releases)) {
				for (const r of releases) {
					if (r.draft) continue;
					const tag = (r.tag_name || r.name || '').trim().replace(/^[vV]/, '');
					if (!tag) continue;
					candidates.push({
						version: tag,
						url: r.html_url || `https://github.com/${GITHUB_REPO}/releases/tag/v${tag}`,
						name: r.name || r.tag_name || `v${tag}`,
						published_at: r.published_at || '',
						body: r.body || '',
					});
				}
			}
		}

		// PARSE TAGS FROM GITHUB API
		if (tagsRes.status === 'fulfilled' && tagsRes.value.ok) {
			const tags = await tagsRes.value.json();
			if (Array.isArray(tags)) {
				for (const t of tags) {
					const tag = (t.name || '').trim().replace(/^[vV]/, '');
					if (!tag) continue;
					// ONLY ADD IF NOT ALREADY IN CANDIDATES FROM RELEASES
					if (!candidates.some((c) => c.version === tag)) {
						candidates.push({
							version: tag,
							url: `https://github.com/${GITHUB_REPO}/releases/tag/v${tag}`,
							name: t.name || `v${tag}`,
							published_at: '',
							body: '',
						});
					}
				}
			}
		}

		// IF GITHUB REST API WAS RATE LIMITED (403), QUERY GITHUB RELEASES ATOM FEED (ZERO RATE LIMIT)
		if (candidates.length === 0) {
			try {
				const atomRes = await fetch(`https://github.com/${GITHUB_REPO}/releases.atom`, {
					headers: { 'User-Agent': 'XianScan-Update-Checker' },
				});
				if (atomRes.ok) {
					const atomText = await atomRes.text();
					// PARSE <title>v0.5.0-beta.1</title> OR <link href=".../releases/tag/v0.5.0-beta.1"/>
					const tagMatches = [...atomText.matchAll(/\/releases\/tag\/v?([0-9A-Za-z.-]+)/g)];
					for (const match of tagMatches) {
						const tag = match[1]?.trim().replace(/^[vV]/, '');
						if (tag && !candidates.some((c) => c.version === tag)) {
							candidates.push({
								version: tag,
								url: `https://github.com/${GITHUB_REPO}/releases/tag/v${tag}`,
								name: `v${tag}`,
								published_at: '',
								body: '',
							});
						}
					}
				}
			} catch {
				// ATOM FALLBACK ERROR
			}
		}

		if (candidates.length === 0) {
			// FALLBACK: IF RATE LIMITED, CHECK IF PREVIOUS CACHE WAS RECORDED
			if (cachedRelease) {
				const hasUpdate = isNewerVersion(currentVersion, cachedRelease.latest_version);
				return json({
					current_version: currentVersion,
					web_build_hash: webBuildHash,
					latest_version: cachedRelease.latest_version,
					has_update: hasUpdate,
					release_url: cachedRelease.release_url,
					release_name: cachedRelease.release_name,
					published_at: cachedRelease.published_at,
					body: cachedRelease.body,
					cached: true,
					error: 'GitHub API rate-limited; showing cached release',
				});
			}

			return json({
				current_version: currentVersion,
				web_build_hash: webBuildHash,
				latest_version: currentVersion,
				has_update: false,
				release_url: `https://github.com/${GITHUB_REPO}/releases`,
				release_name: null,
				published_at: null,
				body: null,
				error: 'GitHub API rate limit exceeded. Please try again in a few minutes.',
			});
		}

		// SORT ALL CANDIDATES BY SEMVER PRECEDENCE DESCENDING
		candidates.sort((a, b) => compareSemver(b.version, a.version));

		const top = candidates[0];

		// CACHE TOP HIGHEST SEMVER RELEASE
		cachedRelease = {
			latest_version: top.version,
			release_url: top.url,
			release_name: top.name,
			published_at: top.published_at,
			body: top.body,
			timestamp: now,
		};

		const hasUpdate = isNewerVersion(currentVersion, top.version);

		return json({
			current_version: currentVersion,
			web_build_hash: webBuildHash,
			latest_version: top.version,
			has_update: hasUpdate,
			release_url: top.url,
			release_name: top.name,
			published_at: top.published_at,
			body: top.body,
			cached: false,
		});
	} catch (err: any) {
		return json({
			current_version: currentVersion,
			web_build_hash: webBuildHash,
			latest_version: cachedRelease ? cachedRelease.latest_version : currentVersion,
			has_update: cachedRelease ? isNewerVersion(currentVersion, cachedRelease.latest_version) : false,
			release_url: cachedRelease?.release_url || `https://github.com/${GITHUB_REPO}/releases`,
			release_name: cachedRelease?.release_name || null,
			published_at: cachedRelease?.published_at || null,
			body: cachedRelease?.body || null,
			error: err?.message || 'Network error querying GitHub API',
		});
	}
};
