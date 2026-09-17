import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

export type AppEnv = 'development' | 'production' | 'demo';

const VALID_APP_ENVS: readonly AppEnv[] = ['development', 'production', 'demo'];

export function resolveAppEnv(raw: string | undefined): AppEnv {
	if (!raw) return 'development';
	if ((VALID_APP_ENVS as readonly string[]).includes(raw)) return raw as AppEnv;
	throw new Error(`Invalid APP_ENV: ${raw}`);
}

export const APP_ENV: AppEnv = resolveAppEnv(env.APP_ENV);

export function assertOAuthLoginAllowed(appEnv: AppEnv = APP_ENV): void {
	if (appEnv === 'demo') {
		error(403, 'OAuth login is disabled in the demo environment');
	}
}

export function assertDestructiveActionAllowed(appEnv: AppEnv = APP_ENV): void {
	if (appEnv === 'demo') {
		error(403, 'This action is disabled in the demo environment');
	}
}
