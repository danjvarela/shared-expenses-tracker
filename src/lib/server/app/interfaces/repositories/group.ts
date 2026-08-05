import type { Group } from '$lib/server/domain/group';

export interface IGroupRepository {
	getAll(userId: string): Promise<Array<Group>>;
	getById(id: string): Promise<Group | null>;
	create(input: {
		name: string;
		currencyCode: string;
		avatarIcon: string | null;
	}): Promise<Group>;
}
