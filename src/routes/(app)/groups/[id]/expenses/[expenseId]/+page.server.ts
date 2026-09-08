import { error, fail, redirect } from '@sveltejs/kit';
import { expenseService, expenseRepo, categoryRepo, receiptService } from '$lib/server/container';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { group } = await parent();

	const expense = await expenseRepo.getWithSplits(params.expenseId);
	if (!expense || expense.groupId !== params.id) {
		error(404, 'Expense not found');
	}

	const categories = await categoryRepo.getAllForGroup(params.id);
	const receipts = await receiptService.getReceiptsForExpense(locals.user!.id, params.expenseId);

	return { group, categories, expense, receipts };
};

export const actions: Actions = {
	delete: async ({ params }) => {
		const expense = await expenseRepo.getWithSplits(params.expenseId);
		if (!expense || expense.groupId !== params.id) {
			error(404, 'Expense not found');
		}

		try {
			await expenseService.deleteExpense(params.expenseId);
		} catch {
			return fail(400, { error: 'Failed to delete expense' });
		}

		redirect(303, `/groups/${params.id}`);
	}
};
