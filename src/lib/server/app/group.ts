import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';

export function createGroupService(deps: { groupRepo: IGroupRepository }) {
	async function getUserGroups(userId: string) {
		return await deps.groupRepo.getAll(userId);
	}

	return { getUserGroups };
}

export type GroupService = ReturnType<typeof createGroupService>;
