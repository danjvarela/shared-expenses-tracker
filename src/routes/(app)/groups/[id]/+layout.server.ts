import { error } from '@sveltejs/kit';
import { groupRepo, groupMemberRepo, scannerEnabled } from '$lib/server/container';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const group = await groupRepo.getById(params.id);
	if (!group) error(404, 'Group not found');

	const isMember = await groupMemberRepo.isMember(params.id, locals.user!.id);
	if (!isMember) error(403, 'Not a member of this group');

	return { group, scannerEnabled };
};
