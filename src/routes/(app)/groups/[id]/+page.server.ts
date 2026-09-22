import { dashboardService } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, params, url }) => {
	const { group } = await parent();
	const month = url.searchParams.get('month') ?? undefined;
	const dashboard = await dashboardService.getGroupDashboard(params.id, month);

	return { group, dashboard };
};
