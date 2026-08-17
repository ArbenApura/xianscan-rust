// APP DATA ROOT — WHERE UPLOADS / CLEANED / OUTPUT IMAGES AND THE SQLITE DB LIVE.
// DEFAULT: ./data RELATIVE TO THE PROCESS CWD (web/ IN DEV, THE APP DIR IN PRODUCTION).
// OVERRIDE WITH DATA_ROOT IN .env.
import { resolve } from 'node:path';
// IMPORTED ENVS ($env/...)
import { env } from '$env/dynamic/private';

export const DATA_ROOT = resolve(env.DATA_ROOT ?? 'data');
