// EFFECTIVE BIND OF THIS NODE PROCESS. HOST AND XIANSCAN_BIND_SOURCE ARE SET BY THE RUST LAUNCHER.
// IMPORTED ENVS ($env/...)
import { env } from '$env/dynamic/private';

export type EffectiveBind = 'local' | 'lan';
export type BindSource = 'setting' | 'env' | 'docker' | 'legacy-default' | 'default';

const BIND_SOURCES: BindSource[] = ['setting', 'env', 'docker', 'legacy-default', 'default'];

export function getEffectiveBind(): EffectiveBind {
	const host = (env.HOST ?? '').trim();
	return host === '0.0.0.0' || host === '::' || host === '[::]' ? 'lan' : 'local';
}

export function getBindSource(): BindSource {
	const raw = (env.XIANSCAN_BIND_SOURCE ?? '').trim() as BindSource;
	return BIND_SOURCES.includes(raw) ? raw : 'default';
}
