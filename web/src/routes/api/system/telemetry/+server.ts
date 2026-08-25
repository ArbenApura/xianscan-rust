import { json } from '@sveltejs/kit';
import { createPipelineClient } from '$lib/server/pipeline-client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const pipeline = createPipelineClient();
		if (pipeline.getTelemetry) {
			const telemetry = await pipeline.getTelemetry();
			return json(telemetry);
		}
		return json(
			{
				gpu: null,
				host_memory: { used_mb: 0, total_mb: 0 },
				cpu: { cores: 1, utilization_pct: null },
				queue: { active_jobs: 0, queued_jobs: 0 },
				timestamp_ms: Date.now(),
			},
			{ status: 200 },
		);
	} catch (e) {
		return json(
			{
				gpu: null,
				host_memory: { used_mb: 0, total_mb: 0 },
				cpu: { cores: 1, utilization_pct: null },
				queue: { active_jobs: 0, queued_jobs: 0 },
				timestamp_ms: Date.now(),
				error: (e as Error).message,
			},
			{ status: 200 },
		);
	}
};
