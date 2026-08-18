import { json } from '@sveltejs/kit';
import { createPipelineClient } from '$lib/server/pipeline-client';
import { setHardwareDeviceSchema } from '$lib/schemas';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const pipeline = createPipelineClient();
		if (pipeline.getHardware) {
			const hw = await pipeline.getHardware();
			return json(hw);
		}
		const health = await pipeline.health();
		return json({
			device_label: health.status === 'ok' ? 'Online' : 'Offline',
			active_provider: 'CPUExecutionProvider',
			providers: ['CPUExecutionProvider'],
			available_providers: ['CPUExecutionProvider'],
			has_cuda: false,
			has_directml: false,
			has_coreml: false,
		});
	} catch (e) {
		return json(
			{
				device_label: 'Offline (ML sidecar unreachable)',
				active_provider: 'None',
				providers: [],
				available_providers: [],
				has_cuda: false,
				has_directml: false,
				has_coreml: false,
				error: (e as Error).message,
			},
			{ status: 200 },
		);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const parsed = setHardwareDeviceSchema.safeParse(body);
		const device = parsed.success ? parsed.data.device : 'auto';
		const pipeline = createPipelineClient();
		if (pipeline.setDevice) {
			const res = await pipeline.setDevice(device);
			return json(res);
		}
		return json({ error: 'Device switching not supported on client' }, { status: 400 });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
};
