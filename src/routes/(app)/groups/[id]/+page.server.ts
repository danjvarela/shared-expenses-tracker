import { dashboardService } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, params }) => {
	const { group } = await parent();
	const dashboard = await dashboardService.getGroupDashboard(params.id);

	return { group, dashboard };
};
