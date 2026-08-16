import { error, fail, redirect } from '@sveltejs/kit';
import {
	expenseService,
	expenseRepo,
	groupMemberService,
	categoryRepo
} from '$lib/server/container';
import { validateExpenseForm } from '$lib/server/app/expense-form';
import { AppError } from '$lib/server/app/error';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { group } = await parent();

	const expense = await expenseRepo.getWithSplits(params.expenseId);
	if (!expense || expense.groupId !== params.id) {
		error(404, 'Expense not found');
	}

	const members = await groupMemberService.getGroupMembers(params.id);
	const categories = await categoryRepo.getAll();

	return { group, members, categories, expense };
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const expense = await expenseRepo.getWithSplits(params.expenseId);
		if (!expense || expense.groupId !== params.id) {
			error(404, 'Expense not found');
		}

		const members = await groupMemberService.getGroupMembers(params.id);
		const memberIds = new Set(members.map((member) => member.userId));
		const paidByIsFormerMember = !memberIds.has(expense.paidByUserId);
		const frozenAmountCents = paidByIsFormerMember
			? expense.amountCents
			: expense.splits
					.filter((split) => !memberIds.has(split.userId))
					.reduce((total, split) => total + split.amountCents, 0);
		const lockedPaidByUserId = paidByIsFormerMember ? expense.paidByUserId : undefined;

		const formData = await request.formData();

		const result = validateExpenseForm(formData, members, frozenAmountCents, lockedPaidByUserId);
		if ('error' in result) {
			return fail(400, { error: result.error });
		}

		try {
			await expenseService.updateExpense(params.expenseId, result.data);
		} catch (err) {
			if (err instanceof AppError) {
				return fail(400, { error: err.message });
			}
			throw err;
		}

		redirect(303, `/groups/${params.id}`);
	}
};
