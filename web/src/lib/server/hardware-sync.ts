// ONE-SHOT STARTUP SYNC: IF THE ML SERVER CAME UP WITHOUT THE PERSISTED VRAM LIMIT, APPLY IT ONCE.
// THIS USED TO RUN ON EVERY GET /api/system/hardware, WHICH MADE A READ SWITCH DEVICES (R3).
// IMPORTED MODULES
import { createPipelineClient } from './pipeline-client';
import { getCanonicalSettings } from './settings-service';

// -- CONSTANTS -- //

const ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;

// -- FUNCTIONS -- //

export async function syncPersistedHardwareSettings(
	options: { attempts?: number; delayMs?: number } = {},
): Promise<boolean> {
	const attempts = options.attempts ?? ATTEMPTS;
	const delayMs = options.delayMs ?? RETRY_DELAY_MS;
	const pipeline = createPipelineClient();
	if (!pipeline.getHardware || !pipeline.setDevice) return false;

	for (let i = 0; i < attempts; i++) {
		try {
			const hw = await pipeline.getHardware();
			const canonical = getCanonicalSettings();
			const wanted = canonical.cudaVramLimitMb;
			if (wanted === undefined || wanted === null || hw.configured_cuda_vram_limit_mb === wanted) return false;
			await pipeline.setDevice(canonical.executionDevice || 'auto', wanted);
			return true;
		} catch {
			// THE ML SERVER MAY STILL BE LOADING MODELS; TRY AGAIN SHORTLY
			if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
		}
	}
	return false;
}
