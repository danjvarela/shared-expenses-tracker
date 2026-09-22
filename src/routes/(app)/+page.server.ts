import { userBalanceService } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userGroupBalances = await userBalanceService.getUserGroupBalances(locals.user!.id);
	const hasOutstandingDebt = userGroupBalances.some((group) => group.netCents < 0);

	return { user: locals.user, userGroupBalances, hasOutstandingDebt };
};
