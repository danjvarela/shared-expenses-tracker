import { groupMemberService, categoryRepo } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { group, scannerEnabled } = await parent();

	const members = await groupMemberService.getGroupMembers(params.id);
	const categories = await categoryRepo.getAll();

	return { group, members, categories, scannerEnabled, user: locals.user };
};
