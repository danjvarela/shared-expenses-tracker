import { fail } from '@sveltejs/kit';
import { userBalanceService, settlementService, pairBalanceRepo } from '$lib/server/container';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const debts = await userBalanceService.getUserDebts(locals.user!.id);

	return { debts };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();

		const groupId = formData.get('groupId');
		const toUserId = formData.get('toUserId');
		const amountCents = Number(formData.get('amountCents'));

		if (typeof groupId !== 'string' || typeof toUserId !== 'string') {
			return fail(400, { error: 'Missing group or counterparty' });
		}
		if (!Number.isInteger(amountCents) || amountCents <= 0) {
			return fail(400, { error: 'Enter a valid amount' });
		}

		const current = await pairBalanceRepo.getForPair(groupId, locals.user!.id, toUserId);
		const remainingCents =
			current && current.fromUserId === locals.user!.id ? current.amountCents : 0;

		if (amountCents > remainingCents) {
			return fail(400, { error: 'Amount exceeds remaining debt' });
		}

		await settlementService.createSettlement({
			groupId,
			fromUserId: locals.user!.id,
			toUserId,
			amountCents
		});

		return { success: true };
	}
};
