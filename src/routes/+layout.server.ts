import { APP_ENV } from '$lib/server/infra/app-env';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	return { appEnv: APP_ENV };
};
