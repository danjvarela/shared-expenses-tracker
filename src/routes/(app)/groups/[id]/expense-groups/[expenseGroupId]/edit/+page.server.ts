import { error } from '@sveltejs/kit';
import { expenseService, groupMemberService, categoryRepo } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { group } = await parent();

	const expenses = await expenseService.getExpenseGroupExpenses(params.expenseGroupId);
	if (expenses.length === 0 || expenses.some((expense) => expense.groupId !== params.id)) {
		error(404, 'Expense group not found');
	}

	const members = await groupMemberService.getGroupMembers(params.id);
	const categories = await categoryRepo.getAllForGroup(params.id);
	const memberIds = new Set(members.map((member) => member.userId));

	const lines = expenses.map((expense) => ({
		...expense,
		locked:
			!memberIds.has(expense.paidByUserId) ||
			expense.splits.some((split) => !memberIds.has(split.userId))
	}));

	return { group, members, categories, expenses: lines, user: locals.user };
};
