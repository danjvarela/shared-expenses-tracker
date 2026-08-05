import { fail, redirect } from '@sveltejs/kit';
import { expenseService, groupMemberService, categoryRepo } from '$lib/server/container';
import { resolveSplits, type SplitMethod } from '$lib/server/app/split-resolver';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { group } = await parent();

	const members = await groupMemberService.getGroupMembers(params.id);
	const categories = await categoryRepo.getAll();

	return { group, members, categories, user: locals.user };
};

function parseAmountCents(raw: FormDataEntryValue | null): number | null {
	if (typeof raw !== 'string' || raw.trim() === '') return null;
	const pesos = Number(raw);
	if (Number.isNaN(pesos)) return null;
	return Math.round(pesos * 100);
}

async function createExpense(
	{ request, params }: { request: Request; params: { id: string } },
	redirectTo: string
) {
	const members = await groupMemberService.getGroupMembers(params.id);
	const formData = await request.formData();

	const description = formData.get('description');
	const amountCents = parseAmountCents(formData.get('amount'));
	const dateRaw = formData.get('date');
	const paidByUserId = formData.get('paidByUserId');
	const categoryIdRaw = formData.get('categoryId');
	const method = formData.get('splitMethod') as SplitMethod | null;

	if (typeof description !== 'string' || description.trim() === '') {
		return fail(400, { error: 'Description is required' });
	}
	if (amountCents === null || amountCents <= 0) {
		return fail(400, { error: 'Enter a valid amount' });
	}
	if (typeof dateRaw !== 'string' || dateRaw.trim() === '') {
		return fail(400, { error: 'Date is required' });
	}
	const date = new Date(dateRaw);
	if (Number.isNaN(date.getTime())) {
		return fail(400, { error: 'Invalid date' });
	}
	if (
		typeof paidByUserId !== 'string' ||
		!members.some((member) => member.userId === paidByUserId)
	) {
		return fail(400, { error: 'Select who paid' });
	}
	if (method !== 'equal' && method !== 'percentage' && method !== 'exact') {
		return fail(400, { error: 'Select a split method' });
	}

	const categoryId =
		typeof categoryIdRaw === 'string' && categoryIdRaw !== '' && categoryIdRaw !== 'none'
			? categoryIdRaw
			: null;

	const splitMembers = members.map((member) => {
		const included = formData.get(`included-${member.userId}`) === 'on';
		const percentRaw = formData.get(`percent-${member.userId}`);
		const exactRaw = formData.get(`exact-${member.userId}`);
		return {
			userId: member.userId,
			included,
			percent: typeof percentRaw === 'string' && percentRaw !== '' ? Number(percentRaw) : undefined,
			exactAmountCents:
				typeof exactRaw === 'string' && exactRaw !== ''
					? (parseAmountCents(exactRaw) ?? 0)
					: undefined
		};
	});

	if (!splitMembers.some((member) => member.included)) {
		return fail(400, { error: 'At least one member must be included in the split' });
	}

	const splits = resolveSplits({
		method,
		amountCents,
		payerId: paidByUserId,
		members: splitMembers
	});

	const sum = splits.reduce((total, split) => total + split.amountCents, 0);
	if (sum !== amountCents) {
		return fail(400, { error: 'Split amounts do not add up to the total' });
	}

	await expenseService.createExpense({
		groupId: params.id,
		paidByUserId,
		categoryId,
		description: description.trim(),
		amountCents,
		date,
		splits
	});

	redirect(303, redirectTo);
}

export const actions: Actions = {
	create: async (event) => createExpense(event, `/groups/${event.params.id}`),
	createAndAddAnother: async (event) =>
		createExpense(event, `/groups/${event.params.id}/expenses/new`)
};
