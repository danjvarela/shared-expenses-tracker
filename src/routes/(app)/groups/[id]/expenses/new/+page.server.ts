import { fail, redirect } from '@sveltejs/kit';
import { expenseService, groupMemberService, categoryRepo } from '$lib/server/container';
import { validateExpenseForm } from '$lib/server/app/expense-form';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { group } = await parent();

	const members = await groupMemberService.getGroupMembers(params.id);
	const categories = await categoryRepo.getAll();

	return { group, members, categories, user: locals.user };
};

async function createExpense(
	{ request, params, locals }: { request: Request; params: { id: string }; locals: App.Locals },
	redirectTo: string
) {
	const members = await groupMemberService.getGroupMembers(params.id);
	const formData = await request.formData();

	const result = validateExpenseForm(formData, members);
	if ('error' in result) {
		return fail(400, { error: result.error });
	}

	await expenseService.createExpense(
		{
			groupId: params.id,
			...result.data
		},
		locals.user!.id
	);

	redirect(303, redirectTo);
}

export const actions: Actions = {
	create: async (event) => createExpense(event, `/groups/${event.params.id}`),
	createAndAddAnother: async (event) =>
		createExpense(event, `/groups/${event.params.id}/expenses/new`)
};
