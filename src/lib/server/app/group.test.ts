import { describe, it, expect } from 'vitest';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import { createGroupService, type GroupRepos } from './group';

const userId = 'alice';

function fakeGroupRepo(): IGroupRepository & {
	created: Array<unknown>;
	updated: Array<unknown>;
} {
	const created: Array<unknown> = [];
	const updated: Array<unknown> = [];
	return {
		created,
		updated,
		async getAll() {
			return [];
		},
		async getById() {
			return null;
		},
		async create(input) {
			const row = { id: 'group-1', createdAt: new Date(), ...input };
			created.push(row);
			return row;
		},
		async update(id, input) {
			const row = { id, createdAt: new Date(), ...input };
			updated.push(row);
			return row;
		}
	};
}

function fakeGroupMemberRepo(): IGroupMemberRepository & { created: Array<unknown> } {
	const created: Array<unknown> = [];
	return {
		created,
		async getAllForGroupWithUser() {
			return [];
		},
		async create(groupId, userId) {
			created.push({ groupId, userId });
		},
		async updateDefaultSplitPercents() {},
		async isMember() {
			return true;
		}
	};
}

function fakeUow(repos: GroupRepos): IUnitOfWork<GroupRepos> {
	return {
		async run(fn) {
			return fn(repos);
		}
	};
}

describe('createGroupService', () => {
	it('creates a group and adds the creator as its sole member', async () => {
		const groupRepo = fakeGroupRepo();
		const groupMemberRepo = fakeGroupMemberRepo();
		const uow = fakeUow({ groupRepo, groupMemberRepo });
		const service = createGroupService({ uow, groupRepo });

		const created = await service.createGroup({
			name: 'Trip',
			currencyCode: 'PHP',
			avatarIcon: null,
			creatorUserId: userId
		});

		expect(created).toMatchObject({ id: 'group-1', name: 'Trip' });
		expect(groupRepo.created).toEqual([
			{
				id: 'group-1',
				createdAt: expect.any(Date),
				name: 'Trip',
				currencyCode: 'PHP',
				avatarIcon: null
			}
		]);
		expect(groupMemberRepo.created).toEqual([{ groupId: 'group-1', userId }]);
	});

	it('defaults currencyCode to PHP when not provided', async () => {
		const groupRepo = fakeGroupRepo();
		const groupMemberRepo = fakeGroupMemberRepo();
		const uow = fakeUow({ groupRepo, groupMemberRepo });
		const service = createGroupService({ uow, groupRepo });

		await service.createGroup({
			name: 'Trip',
			currencyCode: undefined,
			avatarIcon: null,
			creatorUserId: userId
		});

		expect(groupRepo.created).toMatchObject([{ currencyCode: 'PHP' }]);
	});

	it('updates a group', async () => {
		const groupRepo = fakeGroupRepo();
		const groupMemberRepo = fakeGroupMemberRepo();
		const uow = fakeUow({ groupRepo, groupMemberRepo });
		const service = createGroupService({ uow, groupRepo });

		const updated = await service.updateGroup({
			id: 'group-1',
			name: 'Renamed Trip',
			currencyCode: 'USD',
			avatarIcon: 'plane'
		});

		expect(updated).toMatchObject({
			id: 'group-1',
			name: 'Renamed Trip',
			currencyCode: 'USD',
			avatarIcon: 'plane'
		});
		expect(groupRepo.updated).toEqual([
			{
				id: 'group-1',
				createdAt: expect.any(Date),
				name: 'Renamed Trip',
				currencyCode: 'USD',
				avatarIcon: 'plane'
			}
		]);
	});
});
