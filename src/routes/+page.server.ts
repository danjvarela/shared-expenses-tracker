import { getUserGroups } from '$lib/server/app';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const groups = await getUserGroups(locals.user!.id);
	return { user: locals.user, groups };
};
