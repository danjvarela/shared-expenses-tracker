import { env } from '$env/dynamic/private';

export type AppEnv = 'development' | 'production' | 'demo';

const VALID_APP_ENVS: readonly AppEnv[] = ['development', 'production', 'demo'];

export function resolveAppEnv(raw: string | undefined): AppEnv {
	if (!raw) return 'development';
	if ((VALID_APP_ENVS as readonly string[]).includes(raw)) return raw as AppEnv;
	throw new Error(`Invalid APP_ENV: ${raw}`);
}

export const APP_ENV: AppEnv = resolveAppEnv(env.APP_ENV);
