import { fail, redirect } from '@sveltejs/kit';
import {
	groupService,
	groupMemberService,
	groupInviteService,
	removeMemberService
} from '$lib/server/container';
import { toActionResult } from '$lib/server/presentation/error-handling';
import { CURRENCIES } from '$lib/currency';
import type { PageServerLoad, Actions } from './$types';

function trimmedOrNull(value: FormDataEntryValue | null): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export const load: PageServerLoad = async ({ params, parent }) => {
	const { group } = await parent();

	const members = await groupMemberService.getGroupMembers(params.id);
	const hasOutstandingBalance = await groupService.hasOutstandingBalance(params.id);

	return { group, members, hasOutstandingBalance };
};

export const actions: Actions = {
	details: async ({ request, params }) => {
		const formData = await request.formData();

		const name = formData.get('name');
		const currencyCode = trimmedOrNull(formData.get('currencyCode'));
		const avatarIcon = trimmedOrNull(formData.get('avatarIcon'));

		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { error: 'Name is required' });
		}
		if (currencyCode === null || !CURRENCIES.some((currency) => currency.code === currencyCode)) {
			return fail(400, { error: 'Select a valid currency' });
		}

		await groupService.updateGroup({
			id: params.id,
			name: name.trim(),
			currencyCode,
			avatarIcon
		});

		return { success: true };
	},

	percents: async ({ request, params }) => {
		const members = await groupMemberService.getGroupMembers(params.id);
		const formData = await request.formData();

		const entries = members.map((member) => {
			const raw = formData.get(`percent-${member.userId}`);
			const trimmed = typeof raw === 'string' ? raw.trim() : '';
			return {
				userId: member.userId,
				defaultSplitPercent: trimmed === '' ? null : Number(trimmed)
			};
		});

		if (
			entries.some(
				(entry) => entry.defaultSplitPercent !== null && Number.isNaN(entry.defaultSplitPercent)
			)
		) {
			return fail(400, { message: 'Percentages must be numbers' });
		}

		try {
			await groupMemberService.updateDefaultSplitPercents(params.id, entries);
		} catch (err) {
			return toActionResult(err);
		}

		return { success: true };
	},

	invite: async ({ request, params }) => {
		const formData = await request.formData();
		const email = formData.get('email');

		if (typeof email !== 'string' || email.trim() === '') {
			return fail(400, { message: 'Enter an email address' });
		}

		let result;
		try {
			result = await groupInviteService.inviteByEmail(params.id, email.trim());
		} catch (err) {
			return toActionResult(err);
		}

		return { invite: { status: result.status, email: email.trim() } };
	},

	delete: async ({ params }) => {
		try {
			await groupService.deleteGroup(params.id);
		} catch (err) {
			return toActionResult(err);
		}

		redirect(303, '/');
	},

	remove: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const userId = formData.get('userId');

		if (typeof userId !== 'string' || userId.trim() === '') {
			return fail(400, { source: 'remove', message: 'Invalid user' });
		}

		const removerId = locals.user!.id;

		try {
			await removeMemberService.kickUser(params.id, userId, removerId);
			return { success: true };
		} catch (err) {
			const result = toActionResult(err);
			return fail(result.status, { source: 'remove', ...result.data });
		}
	}
};
