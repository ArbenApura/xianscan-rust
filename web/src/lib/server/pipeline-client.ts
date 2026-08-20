import { env } from '$env/dynamic/private';
import { unzipSync } from 'fflate';

// -- TYPES -- //

export interface PipelineBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface PipelineRegion {
	id: string;
	box: PipelineBox;
	polygon: number[][];
	bubble_box?: PipelineBox | null;
	bubble_polygon?: number[][] | null;
	centroid?: { x: number; y: number } | null;
	kind?: 'dialogue_bubble' | 'free_text' | 'sound_effect';
	text: string;
	confidence: number;
	vertical: boolean;
	angle?: number;
}

export interface AnalyzeResult {
	width: number;
	height: number;
	backend: string;
	regions: PipelineRegion[];
}

export interface CleanRegionInput {
	id: string;
	box: PipelineBox;
	polygon: number[][];
}

export interface HardwareStatus {
	device_label: string;
	active_provider: string;
	providers: string[];
	available_providers: string[];
	has_cuda: boolean;
	has_directml: boolean;
	has_directml_raw?: boolean;
	has_coreml: boolean;
	has_dedicated_gpu?: boolean;
	detected_gpus?: Array<{ device_id: number; name: string; vram_mb: number; is_dedicated: boolean; is_integrated: boolean }>;
	gpu_warning?: string | null;
}

export interface PipelineClient {
	preprocess(image: Buffer, signal?: AbortSignal): Promise<Buffer>;
	analyze(image: Buffer, signal?: AbortSignal, opts?: { sourceLang?: string; targetLang?: string }): Promise<AnalyzeResult>;
	clean(image: Buffer, regions: CleanRegionInput[], inpaintMode?: string, signal?: AbortSignal): Promise<Buffer>;
	health(): Promise<{ status: string; detector: string; inpainter: string }>;
	getHardware?(signal?: AbortSignal): Promise<HardwareStatus>;
	setDevice?(device: string, signal?: AbortSignal): Promise<HardwareStatus>;
	stitch?(imageTop: Buffer, imageBottom: Buffer, signal?: AbortSignal): Promise<Buffer>;
	reslice?(images: Buffer[], signal?: AbortSignal, run?: number): Promise<Buffer[]>;
	pollResliceStatus?(signal?: AbortSignal): Promise<{ pct: number; message: string; done: boolean; run?: number }>;
	resetResliceStatus?(signal?: AbortSignal): Promise<{ run: number }>;
	cancelReslice?(run?: number): Promise<void>;
}

// -- ERRORS -- //

export class PipelineError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = 'PipelineError';
	}
}

// -- HTTP IMPLEMENTATION -- //

export class HttpPipelineClient implements PipelineClient {
	constructor(
		private readonly baseUrl: string,
		private readonly fetchImpl: typeof fetch = fetch,
	) {
		// NORMALISE: NEVER BUILD `//pages/...` FROM A TRAILING-SLASH BASE URL
		this.baseUrl = baseUrl.replace(/\/+$/, '');
	}

	private async request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
		try {
			return await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal });
		} catch (e) {
			if (e instanceof PipelineError) throw e;
			// NETWORK / ABORT — SURFACE AS A CLEAR SIDECAR-DOWN ERROR
			if ((e as { name?: string })?.name === 'AbortError') throw e;
			throw new PipelineError(`ML sidecar unreachable at ${this.baseUrl}${path}: ${(e as Error).message}`, 0);
		}
	}

	async preprocess(image: Buffer, signal?: AbortSignal): Promise<Buffer> {
		const form = new FormData();
		form.append('image', new Blob([new Uint8Array(image)]), 'page.png');
		const resp = await this.request('/pages/preprocess', { method: 'POST', body: form }, signal);
		if (!resp.ok) throw new PipelineError(`preprocess failed (${resp.status}): ${await resp.text()}`, resp.status);
		return Buffer.from(await resp.arrayBuffer());
	}

	async analyze(image: Buffer, signal?: AbortSignal, opts?: { sourceLang?: string; targetLang?: string }): Promise<AnalyzeResult> {
		const form = new FormData();
		form.append('image', new Blob([new Uint8Array(image)]), 'page.png');
		if (opts?.sourceLang) form.append('source_lang', opts.sourceLang);
		if (opts?.targetLang) form.append('target_lang', opts.targetLang);
		const resp = await this.request('/pages/analyze', { method: 'POST', body: form }, signal);
		if (!resp.ok) throw new PipelineError(`analyze failed (${resp.status}): ${await resp.text()}`, resp.status);
		return (await resp.json()) as AnalyzeResult;
	}

	async clean(image: Buffer, regions: CleanRegionInput[], inpaintMode: string = 'patch', signal?: AbortSignal): Promise<Buffer> {
		const form = new FormData();
		form.append('image', new Blob([new Uint8Array(image)]), 'page.png');
		form.append('regions', JSON.stringify(regions));
		form.append('inpaint_mode', inpaintMode);
		const resp = await this.request('/pages/clean', { method: 'POST', body: form }, signal);
		if (!resp.ok) throw new PipelineError(`clean failed (${resp.status}): ${await resp.text()}`, resp.status);
		return Buffer.from(await resp.arrayBuffer());
	}

	async getHardware(signal?: AbortSignal): Promise<HardwareStatus> {
		const resp = await this.request('/system/hardware', { method: 'GET' }, signal);
		if (!resp.ok) throw new PipelineError(`getHardware failed (${resp.status})`, resp.status);
		return (await resp.json()) as HardwareStatus;
	}

	async setDevice(device: string, signal?: AbortSignal): Promise<HardwareStatus> {
		const resp = await this.request(
			'/system/device',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ device }),
			},
			signal,
		);
		if (!resp.ok) throw new PipelineError(`setDevice failed (${resp.status})`, resp.status);
		return (await resp.json()) as HardwareStatus;
	}

	async stitch(imageTop: Buffer, imageBottom: Buffer, signal?: AbortSignal): Promise<Buffer> {
		const form = new FormData();
		form.append('image_top', new Blob([new Uint8Array(imageTop)]), 'top.png');
		form.append('image_bottom', new Blob([new Uint8Array(imageBottom)]), 'bottom.png');
		const resp = await this.request('/pages/stitch', { method: 'POST', body: form }, signal);
		if (!resp.ok) throw new PipelineError(`stitch failed (${resp.status}): ${await resp.text()}`, resp.status);
		return Buffer.from(await resp.arrayBuffer());
	}

	async reslice(images: Buffer[], signal?: AbortSignal, run?: number): Promise<Buffer[]> {
		const form = new FormData();
		for (let i = 0; i < images.length; i++) {
			form.append('files', new Blob([new Uint8Array(images[i])]), `slice_${i}.png`);
		}
		// TAG THE REQUEST WITH ITS RUN ID (FROM resetResliceStatus) SO THE SIDECAR
		// MATCHES PROGRESS FRAMES & CANCELS TO THE RIGHT RUN.
		if (run !== undefined) form.append('run', String(run));
		const resp = await this.request('/pages/reslice', { method: 'POST', body: form }, signal);
		if (!resp.ok) throw new PipelineError(`reslice failed (${resp.status}): ${await resp.text()}`, resp.status);
		const zipBuf = Buffer.from(await resp.arrayBuffer());
		const unzipped = unzipSync(new Uint8Array(zipBuf));
		const keys = Object.keys(unzipped)
			.filter((k) => /\.(webp|png|jpe?g)$/i.test(k))
			.sort((a, b) => {
				const numA = parseInt(a.replace(/\.(webp|png|jpe?g)$/i, ''), 10);
				const numB = parseInt(b.replace(/\.(webp|png|jpe?g)$/i, ''), 10);
				return numA - numB;
			});
		return keys.map((k) => Buffer.from(unzipped[k]));
	}

	// POLL THE SIDECAR'S CURRENT RESLICE PROGRESS. LIGHTWEIGHT JSON GET — THE
	// WEB CALLS THIS ON AN INTERVAL WHILE THE (BLOCKING) RESLICE POST RUNS ON A
	// SEPARATE REQUEST, SO IT NEVER RACES THE LONG-RUNNING WORK. THE FRAME'S
	// `run` ID LETS THE CALLER IGNORE FRAMES FROM A STALE RUN.
	async pollResliceStatus(
		signal?: AbortSignal,
	): Promise<{ pct: number; message: string; done: boolean; run?: number }> {
		const resp = await this.request('/pages/reslice/status', { method: 'GET' }, signal);
		if (!resp.ok) throw new PipelineError(`reslice status failed (${resp.status})`, resp.status);
		return (await resp.json()) as { pct: number; message: string; done: boolean; run?: number };
	}

	// RESET STALE PROGRESS FROM A PREVIOUS RUN BEFORE STARTING A NEW ONE.
	// RETURNS THE NEW RUN ID USED TO TAG EVERY FRAME OF THE UPCOMING RUN.
	async resetResliceStatus(signal?: AbortSignal): Promise<{ run: number }> {
		const resp = await this.request('/pages/reslice/reset', { method: 'POST', body: undefined }, signal);
		if (!resp.ok) throw new PipelineError(`reslice reset failed (${resp.status})`, resp.status);
		return (await resp.json()) as { run: number };
	}

	// ASK THE SIDECAR TO STOP AN IN-FLIGHT RESLICE AT ITS NEXT CHECKPOINT.
	// DELIBERATELY TAKES NO ABORT SIGNAL — THE CALLER INVOKES THIS *BECAUSE*
	// ITS OWN SIGNAL WAS ABORTED. `run` TARGETS A SPECIFIC RUN (0 = CURRENT).
	async cancelReslice(run?: number): Promise<void> {
		const resp = await this.request('/pages/reslice/cancel', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ run: run ?? 0 }),
		});
		if (!resp.ok) throw new PipelineError(`reslice cancel failed (${resp.status})`, resp.status);
	}

	async health(): Promise<{ status: string; detector: string; inpainter: string }> {
		const resp = await this.request('/health', { method: 'GET' });
		if (!resp.ok) throw new PipelineError(`health failed (${resp.status})`, resp.status);
		return (await resp.json()) as { status: string; detector: string; inpainter: string };
	}
}

// THE PRODUCTION SINGLETON — FAILS FAST AT CREATION WHEN THE SIDECAR ISN'T CONFIGURED.
export function createPipelineClient(): PipelineClient {
	const baseUrl = env.ML_BASE_URL ?? '';
	if (!baseUrl) {
		throw new Error('ML_BASE_URL is not set — start the ML sidecar (ml/README) and set ML_BASE_URL=http://127.0.0.1:8123');
	}
	return new HttpPipelineClient(baseUrl.replace(/\/+$/, ''));
}
