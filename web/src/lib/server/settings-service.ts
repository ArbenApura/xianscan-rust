import { eq } from 'drizzle-orm';
import { db as defaultDb } from './db';
import { appSettings } from './db/schema';
import { DEFAULTS, type AppSettings, type InpaintMode, type ExecutionDevice, type TypesetOutline, type TypesetContrast, type TypesetCasing } from '$lib/stores/settings';

// IN-MEMORY SETTINGS CACHE
let cachedSettings: AppSettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute TTL fallback

export function invalidateSettingsCache(): void {
	cachedSettings = null;
	cacheTimestamp = 0;
}

const VALID_INPAINT_MODES: InpaintMode[] = ['patch', 'scaled', 'full'];
const VALID_EXEC_DEVICES: ExecutionDevice[] = ['auto', 'cuda', 'dml', 'coreml', 'cpu'];
const VALID_OUTLINES: TypesetOutline[] = ['none', 'thin', 'standard', 'heavy'];
const VALID_CONTRASTS: TypesetContrast[] = ['auto', 'dark', 'light'];
const VALID_CASINGS: TypesetCasing[] = ['uppercase', 'original', 'lowercase'];

// SANITIZE AND CLAMP INPUT VALUES AGAINST SCHEMA INVARIANTS
export function sanitizeSettingValue(key: keyof AppSettings, value: unknown): unknown {
	if (value === undefined) return undefined;

	switch (key) {
		case 'cudaVramLimitMb':
			if (value === null) return null;
			if (typeof value === 'number' && !isNaN(value)) {
				return Math.max(1024, Math.min(65536, Math.round(value)));
			}
			return null;

		case 'parallelProcesses': {
			const n = Number(value);
			return Math.max(1, Math.min(8, isNaN(n) ? 1 : Math.round(n)));
		}

		case 'parallelChapters': {
			const n = Number(value);
			return Math.max(1, Math.min(4, isNaN(n) ? 1 : Math.round(n)));
		}

		case 'inpaintExpansionPct': {
			const n = Number(value);
			return Math.max(0.0, Math.min(0.20, isNaN(n) ? 0.03 : n));
		}

		case 'typesetExpansionPct': {
			const n = Number(value);
			return Math.max(0.0, Math.min(0.30, isNaN(n) ? 0.03 : n));
		}

		case 'typesetPadding': {
			const n = Number(value);
			return Math.max(0.01, Math.min(0.15, isNaN(n) ? 0.05 : n));
		}

		case 'inpaintMode':
			return VALID_INPAINT_MODES.includes(value as InpaintMode) ? value : 'patch';

		case 'executionDevice':
			return VALID_EXEC_DEVICES.includes(value as ExecutionDevice) ? value : 'auto';

		case 'typesetOutline':
			return VALID_OUTLINES.includes(value as TypesetOutline) ? value : 'standard';

		case 'typesetContrast':
			return VALID_CONTRASTS.includes(value as TypesetContrast) ? value : 'auto';

		case 'typesetCasing':
			return VALID_CASINGS.includes(value as TypesetCasing) ? value : 'uppercase';

		case 'enableTextRotation':
		case 'resliceBeforeBatch':
		case 'typesetAllCaps':
		case 'hasCompletedOnboarding':
			return Boolean(value);

		case 'version': {
			const n = Number(value);
			return Math.max(1, isNaN(n) ? 1 : Math.round(n));
		}

		case 'theme':
			return ['auto', 'light', 'sepia', 'dark'].includes(value as string) ? value : 'sepia';

		case 'appFont':
			return ['comic', 'clash', 'general', 'poppins', 'proxima', 'nunito', 'montserrat', 'lexend'].includes(value as string) ? value : 'comic';

		case 'readerViewMode':
			return ['reader', 'grid', 'compare'].includes(value as string) ? value : 'compare';

		case 'webtoonKind':
			return ['output', 'original'].includes(value as string) ? value : 'output';

		case 'webtoonWidth':
			return ['sm', 'md', 'lg'].includes(value as string) ? value : 'md';

		case 'libraryLayout':
			return ['grid', 'list', 'compact'].includes(value as string) ? value : 'grid';

		case 'librarySort':
			return ['recent', 'title_asc', 'title_desc', 'chapters_desc', 'chapters_asc'].includes(value as string) ? value : 'recent';

		case 'chapterLayout':
			return ['grid', 'list', 'compact'].includes(value as string) ? value : 'list';

		case 'chapterSortAsc':
			return Boolean(value);

		case 'typesetPreviewPreset':
			return ['en', 'ja', 'zh', 'ko', 'custom'].includes(value as string) ? value : 'en';

		case 'typesetPreviewText':
			return typeof value === 'string' ? value.slice(0, 500) : String(value || '').slice(0, 500);

		default:
			if (typeof DEFAULTS[key] === 'string' && typeof value === 'string') {
				return value.trim().slice(0, 128);
			}
			return typeof DEFAULTS[key] === 'string' ? String(value || '').trim().slice(0, 128) : value;
	}
}

// RECONCILE ROW VALUES WITH TYPE-CHECKED DEFAULTS
function parseSettingValue<T>(key: keyof AppSettings, raw: string, defaultValue: T): T {
	try {
		const parsed = JSON.parse(raw);

		// Special case for nullable settings like cudaVramLimitMb
		if (key === 'cudaVramLimitMb') {
			if (parsed === null) return null as unknown as T;
			if (typeof parsed === 'number' && !isNaN(parsed)) return parsed as unknown as T;
			return null as unknown as T;
		}

		if (typeof parsed === typeof defaultValue) {
			return sanitizeSettingValue(key, parsed) as T;
		}
		if (defaultValue === null && parsed === null) {
			return null as unknown as T;
		}
	} catch {
		if (typeof defaultValue === 'string') {
			return raw as unknown as T;
		}
	}
	return defaultValue;
}

export function getCanonicalSettings(db = defaultDb): AppSettings {
	const now = Date.now();
	if (cachedSettings && now - cacheTimestamp < CACHE_TTL_MS) {
		return { ...cachedSettings };
	}

	const result: AppSettings = { ...DEFAULTS };

	try {
		const rows = db.select().from(appSettings).all();
		const rowMap = new Map(rows.map((r) => [r.key, r.value]));

		for (const key of Object.keys(DEFAULTS) as (keyof AppSettings)[]) {
			const raw = rowMap.get(key);
			if (raw !== undefined) {
				(result as unknown as Record<string, unknown>)[key] = parseSettingValue(
					key,
					raw,
					DEFAULTS[key]
				);
			}
		}

		cachedSettings = { ...result };
		cacheTimestamp = now;
	} catch (err) {
		console.warn('[settings-service] failed to load app_settings:', err);
		return { ...DEFAULTS };
	}

	return result;
}

export function updateCanonicalSettings(
	updates: Partial<AppSettings>,
	db = defaultDb
): AppSettings {
	const now = Date.now();
	const validKeys = Object.keys(DEFAULTS) as (keyof AppSettings)[];
	const entriesToUpdate: Array<{ key: string; value: string }> = [];

	for (const [k, v] of Object.entries(updates)) {
		const key = k as keyof AppSettings;
		if (!validKeys.includes(key) || v === undefined) continue;

		const sanitized = sanitizeSettingValue(key, v);
		entriesToUpdate.push({
			key,
			value: JSON.stringify(sanitized),
		});
	}

	if (entriesToUpdate.length === 0) {
		return getCanonicalSettings(db);
	}

	try {
		// ATOMIC TRANSACTION: ALL-OR-NOTHING BATCH UPSERT
		db.transaction((tx) => {
			for (const entry of entriesToUpdate) {
				tx.insert(appSettings)
					.values({
						key: entry.key,
						value: entry.value,
						updatedAt: now,
					})
					.onConflictDoUpdate({
						target: appSettings.key,
						set: {
							value: entry.value,
							updatedAt: now,
						},
					})
					.run();
			}
		});

		invalidateSettingsCache();
	} catch (err) {
		console.error('[settings-service] failed to update settings in transaction:', err);
		throw err;
	}

	const canonical = getCanonicalSettings(db);
	for (const listener of settingsListeners) {
		try {
			listener(canonical);
		} catch (err) {
			console.warn('[settings-service] error in settings listener:', err);
		}
	}

	return canonical;
}

type SettingsListener = (settings: AppSettings) => void;
const settingsListeners = new Set<SettingsListener>();

export function onSettingsUpdated(listener: SettingsListener): () => void {
	settingsListeners.add(listener);
	return () => settingsListeners.delete(listener);
}

export function seedInitialSettingsIfEmpty(
	initialValues: Partial<AppSettings>,
	db = defaultDb
): void {
	try {
		const existing = db.select({ key: appSettings.key }).from(appSettings).limit(1).all();
		if (existing.length === 0 && Object.keys(initialValues).length > 0) {
			updateCanonicalSettings(initialValues, db);
		}
	} catch {
		// Ignore check failure
	}
}
