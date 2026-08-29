import { json } from '@sveltejs/kit';
import { createPipelineClient } from '$lib/server/pipeline-client';
import { setHardwareDeviceSchema } from '$lib/schemas';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const pipeline = createPipelineClient();

		if (pipeline.getHardware) {
			const hw = await pipeline.getHardware();
			return json({
				...hw,
				version: hw.version || '0.4.0-beta.7',
				app_version: hw.app_version || '0.4.0-beta.7+dev',
				web_build_hash: hw.web_build_hash || 'dev',
				web_build_time: hw.web_build_time || '0',
			});
		}

		const health = (await pipeline.health()) as {
			status?: string;
			version?: string;
			app_version?: string;
			web_build_hash?: string;
			web_build_time?: string;
		};
		return json({
			device_label: health.status === 'ok' ? 'Online' : 'Offline',
			active_provider: 'CPUExecutionProvider',
			providers: ['CPUExecutionProvider'],
			available_providers: ['CPUExecutionProvider'],
			has_cuda: false,
			has_directml: false,
			has_coreml: false,
			version: health.version || '0.4.0-beta.7',
			app_version: health.app_version || '0.4.0-beta.7+dev',
			web_build_hash: health.web_build_hash || 'dev',
			web_build_time: health.web_build_time || '0',
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
				version: '0.4.0-beta.7',
				app_version: '0.4.0-beta.7+dev',
				web_build_hash: 'dev',
				web_build_time: '0',
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
		const vramLimitMb = parsed.success ? parsed.data.vram_limit_mb : undefined;
		const pipeline = createPipelineClient();
		if (pipeline.setDevice) {
			const res = await pipeline.setDevice(device, vramLimitMb);
			return json(res);
		}
		return json({ error: 'Device switching not supported on client' }, { status: 400 });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
};
