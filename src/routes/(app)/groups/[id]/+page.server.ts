import { groupBalanceService, expenseService } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { group } = await parent();

	const groupExpenses = await expenseService.getGroupExpenses(params.id);
	const debts = await groupBalanceService.getDebtsForUserInGroup(locals.user!.id, params.id);

	return { user: locals.user, group, groupExpenses, hasOutstandingDebt: debts.length > 0 };
};
