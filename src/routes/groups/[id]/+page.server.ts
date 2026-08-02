import { error } from '@sveltejs/kit';
import { expenseService, groupRepo } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const group = await groupRepo.getById(params.id);
	if (!group) error(404, 'Group not found');

	const groupExpenses = await expenseService.getGroupExpenses(params.id);

	return { user: locals.user, group, groupExpenses };
};
