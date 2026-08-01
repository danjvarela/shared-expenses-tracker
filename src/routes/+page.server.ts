import { getUserGroups } from '$lib/server/app';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const USER_ID = '0207472f-873b-4c0f-92ad-254e97378dcb';
	const groups = await getUserGroups(USER_ID);

	return { groups };
};
