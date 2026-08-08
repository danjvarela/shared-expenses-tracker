import { fail, redirect } from '@sveltejs/kit';
import { groupService, groupMemberService, groupInviteService } from '$lib/server/container';
import { GroupHasOutstandingBalanceError } from '$lib/server/app/group';
import { InvalidInviteEmailError } from '$lib/server/app/group-invite';
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
			return fail(400, { error: 'Percentages must be numbers' });
		}

		try {
			await groupMemberService.updateDefaultSplitPercents(params.id, entries);
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Could not save' });
		}

		return { success: true };
	},

	invite: async ({ request, params }) => {
		const formData = await request.formData();
		const email = formData.get('email');

		if (typeof email !== 'string' || email.trim() === '') {
			return fail(400, { inviteError: 'Enter an email address' });
		}

		let result;
		try {
			result = await groupInviteService.inviteByEmail(params.id, email.trim());
		} catch (err) {
			if (err instanceof InvalidInviteEmailError) {
				return fail(400, { inviteError: 'Enter a valid email address' });
			}
			throw err;
		}

		return { invite: { status: result.status, email: email.trim() } };
	},

	delete: async ({ params }) => {
		try {
			await groupService.deleteGroup(params.id);
		} catch (err) {
			if (err instanceof GroupHasOutstandingBalanceError) {
				return fail(400, { error: 'This group still has an outstanding balance to settle' });
			}
			throw err;
		}

		redirect(303, '/');
	}
};
