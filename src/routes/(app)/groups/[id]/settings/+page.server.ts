import { fail } from '@sveltejs/kit';
import { groupService, groupMemberService } from '$lib/server/container';
import { CURRENCIES } from '$lib/currency';
import type { PageServerLoad, Actions } from './$types';

function trimmedOrNull(value: FormDataEntryValue | null): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export const load: PageServerLoad = async ({ params, parent }) => {
	const { group } = await parent();

	const members = await groupMemberService.getGroupMembers(params.id);

	return { group, members };
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

		if (entries.some((entry) => entry.defaultSplitPercent !== null && Number.isNaN(entry.defaultSplitPercent))) {
			return fail(400, { error: 'Percentages must be numbers' });
		}

		try {
			await groupMemberService.updateDefaultSplitPercents(params.id, entries);
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Could not save' });
		}

		return { success: true };
	}
};
