import { fail } from '@sveltejs/kit';
import { groupBalanceService, settlementService, pairBalanceRepo } from '$lib/server/container';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { group } = await parent();
	const debts = await groupBalanceService.getDebtsForUserInGroup(locals.user!.id, params.id);

	return { group, debts };
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const formData = await request.formData();

		const toUserId = formData.get('toUserId');
		const amountCents = Number(formData.get('amountCents'));

		if (typeof toUserId !== 'string') {
			return fail(400, { error: 'Missing counterparty' });
		}
		if (!Number.isInteger(amountCents) || amountCents <= 0) {
			return fail(400, { error: 'Enter a valid amount' });
		}

		const current = await pairBalanceRepo.getForPair(params.id, locals.user!.id, toUserId);
		const remainingCents =
			current && current.fromUserId === locals.user!.id ? current.amountCents : 0;

		if (amountCents > remainingCents) {
			return fail(400, { error: 'Amount exceeds remaining debt' });
		}

		await settlementService.createSettlement({
			groupId: params.id,
			fromUserId: locals.user!.id,
			toUserId,
			amountCents
		});

		return { success: true };
	}
};
