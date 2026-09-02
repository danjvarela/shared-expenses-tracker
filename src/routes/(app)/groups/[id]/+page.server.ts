import { groupBalanceService, expenseService, categoryRepo } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { group } = await parent();

	const [groupExpenses, categories] = await Promise.all([
		expenseService.getGroupExpenses(params.id),
		categoryRepo.getAll()
	]);
	const debts = await groupBalanceService.getDebtsForUserInGroup(locals.user!.id, params.id);

	return { user: locals.user, group, groupExpenses, categories, hasOutstandingDebt: debts.length > 0 };
};
