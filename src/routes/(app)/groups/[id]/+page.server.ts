import {
	groupBalanceService,
	expenseService,
	categoryRepo,
	groupMemberService
} from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { group } = await parent();

	const [groupExpenses, categories, members] = await Promise.all([
		expenseService.getGroupExpenses(params.id),
		categoryRepo.getAllForGroup(params.id),
		groupMemberService.getGroupMembers(params.id)
	]);
	const debts = await groupBalanceService.getDebtsForUserInGroup(locals.user!.id, params.id);

	return {
		user: locals.user,
		group,
		groupExpenses,
		categories,
		members,
		hasOutstandingDebt: debts.length > 0
	};
};
