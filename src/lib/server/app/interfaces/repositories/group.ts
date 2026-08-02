import type { Group } from '$lib/server/domain/group';

export interface IGroupRepository {
	getAll(userId: string): Promise<Array<Group>>;
	getById(id: string): Promise<Group | null>;
}
