import { error } from '@sveltejs/kit';
import { settlementRepo, groupMemberService } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { group } = await parent();

	const settlement = await settlementRepo.getById(params.settlementId);
	if (!settlement || settlement.groupId !== params.id) {
		error(404, 'Settlement not found');
	}

	const members = await groupMemberService.getGroupMembers(params.id);

	return { group, members, settlement };
};
