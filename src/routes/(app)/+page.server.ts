import { userBalanceService, dashboardService } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const userGroupBalances = await userBalanceService.getUserGroupBalances(locals.user!.id);
	const hasOutstandingDebt = userGroupBalances.some((group) => group.netCents < 0);
	const month = url.searchParams.get('month') ?? undefined;
	const dashboard = await dashboardService.getHomepageDashboard(locals.user!.id, month);

	return { user: locals.user, userGroupBalances, hasOutstandingDebt, dashboard };
};
