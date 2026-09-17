import { APP_ENV } from '$lib/server/infra/app-env';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '$lib/server/infra/demo-credentials';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (APP_ENV !== 'demo') return {};

	return {
		demo: {
			emails: DEMO_ACCOUNTS.map((account) => account.email),
			password: DEMO_PASSWORD
		}
	};
};
