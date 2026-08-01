import { getAll } from '$lib/server/infra/db/repositories/group';

export async function getUserGroups(userId: string) {
	return await getAll(userId);
}
