import { groupMemberService } from '$lib/server/container';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { group, scannerEnabled } = await parent();

	const members = await groupMemberService.getGroupMembers(params.id);

	return { group, members, scannerEnabled, user: locals.user };
};
