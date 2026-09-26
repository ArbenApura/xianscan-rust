import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDevice = vi.fn(async () => ({ configured_cuda_vram_limit_mb: 4096 }));
const getHardware = vi.fn(async () => ({ configured_cuda_vram_limit_mb: null, device_label: 'CPU' }));

vi.mock('$lib/server/pipeline-client', () => ({
	createPipelineClient: () => ({ getHardware, setDevice, health: vi.fn() }),
}));
vi.mock('$lib/server/settings-service', () => ({
	getCanonicalSettings: () => ({ cudaVramLimitMb: 4096, executionDevice: 'cuda' }),
}));

describe('GET /api/system/hardware', () => {
	beforeEach(() => {
		setDevice.mockClear();
		getHardware.mockClear();
	});

	it('does not switch devices on a read', async () => {
		const { GET } = await import('../../src/routes/api/system/hardware/+server');
		const res = await GET({} as any);
		expect(res.status).toBe(200);
		expect(getHardware).toHaveBeenCalledTimes(1);
		expect(setDevice).not.toHaveBeenCalled();
	});

	it('the startup sync applies the persisted VRAM limit once', async () => {
		const { syncPersistedHardwareSettings } = await import('$lib/server/hardware-sync');
		const applied = await syncPersistedHardwareSettings({ attempts: 1, delayMs: 0 });
		expect(applied).toBe(true);
		expect(setDevice).toHaveBeenCalledWith('cuda', 4096);
	});
});
