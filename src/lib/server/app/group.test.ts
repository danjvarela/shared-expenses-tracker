import { describe, it, expect } from 'vitest';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type { Group } from '$lib/server/domain/group';
import { createGroupService } from './group';

function fakeGroupRepo(byUser: Record<string, Array<Group>>): IGroupRepository {
	return {
		async getAll(userId) {
			return byUser[userId] ?? [];
		}
	};
}

describe('createGroupService', () => {
	it('returns the groups the repo reports for a user', async () => {
		const group: Group = { id: 'group-1', name: 'Trip', createdAt: new Date() };
		const service = createGroupService({
			groupRepo: fakeGroupRepo({ 'user-1': [group] })
		});

		expect(await service.getUserGroups('user-1')).toEqual([group]);
		expect(await service.getUserGroups('user-2')).toEqual([]);
	});
});
