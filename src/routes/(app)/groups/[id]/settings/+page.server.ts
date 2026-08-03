import { error, fail } from '@sveltejs/kit';
import { groupRepo, groupMemberService } from '$lib/server/container';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const group = await groupRepo.getById(params.id);
	if (!group) error(404, 'Group not found');

	const members = await groupMemberService.getGroupMembers(params.id);

	return { group, members };
};

export const actions: Actions = {
	default: async ({ request, params }) => {
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
