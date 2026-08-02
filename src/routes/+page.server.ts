import { userBalanceService } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userGroupBalances = await userBalanceService.getUserGroupBalances(locals.user!.id);

	return { user: locals.user, userGroupBalances };
};
