import { db } from '$lib/server/infra/db';
import { createGroupRepository } from '$lib/server/infra/db/repositories/group';

const groupRepo = createGroupRepository(db);

export async function getUserGroups(userId: string) {
	return await groupRepo.getAll(userId);
}
