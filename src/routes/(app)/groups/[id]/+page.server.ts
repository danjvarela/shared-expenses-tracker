import { expenseService } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { group } = await parent();

	const groupExpenses = await expenseService.getGroupExpenses(params.id);

	return { user: locals.user, group, groupExpenses };
};
