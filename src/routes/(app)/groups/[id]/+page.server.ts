import { error, fail } from '@sveltejs/kit';
import { expenseService, expenseRepo } from '$lib/server/container';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { group } = await parent();

	const groupExpenses = await expenseService.getGroupExpenses(params.id);

	return { user: locals.user, group, groupExpenses };
};

export const actions: Actions = {
	delete: async ({ request, params }) => {
		const formData = await request.formData();
		const expenseId = formData.get('expenseId');
		if (typeof expenseId !== 'string') {
			return fail(400, { error: 'Missing expense id' });
		}

		const expense = await expenseRepo.getWithSplits(expenseId);
		if (!expense || expense.groupId !== params.id) {
			error(404, 'Expense not found');
		}

		try {
			await expenseService.deleteExpense(expenseId);
		} catch {
			return fail(400, { error: 'Failed to delete expense' });
		}

		return { success: true };
	}
};
