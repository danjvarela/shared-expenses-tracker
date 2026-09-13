import { describe, it, expect } from 'vitest';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import type { ICategoryRepository } from '$lib/server/app/interfaces/repositories/category';
import type { Category } from '$lib/server/domain/category';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import { createGroupService, type GroupRepos } from './group';

const userId = 'alice';

function fakeGroupRepo(): IGroupRepository & {
	created: Array<unknown>;
	updated: Array<unknown>;
	deleted: Array<string>;
} {
	const created: Array<unknown> = [];
	const updated: Array<unknown> = [];
	const deleted: Array<string> = [];
	return {
		created,
		updated,
		deleted,
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
		},
		async delete(id) {
			deleted.push(id);
		}
	};
}

function fakePairBalanceRepo(balances: Array<unknown> = []): IPairBalanceRepository {
	return {
		async getForPair() {
			return null;
		},
		async replaceForPair() {},
		async getAllForGroup() {
			return balances as never;
		},
		async getNetForUserInGroups() {
			return new Map();
		},
		async hasBalanceForUserInGroup() {
			return false;
		},
		async getDebtsForUser() {
			return [];
		},
		async getDebtsForUserInGroup() {
			return [];
		},
		async replaceAllForGroup() {}
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
		},
		async countByGroup() {
			return 0;
		},
		async remove() {},
		async getGroupIdsForUser() {
			return [];
		}
	};
}

function fakeCategoryRepo(
	defaults: Array<Category> = []
): ICategoryRepository & { addedToGroup: Array<{ groupId: string; categoryId: string }> } {
	const addedToGroup: Array<{ groupId: string; categoryId: string }> = [];
	return {
		addedToGroup,
		async getAll() {
			return defaults;
		},
		async getDefaults() {
			return defaults;
		},
		async getAllForGroup() {
			return [];
		},
		async findById() {
			return null;
		},
		async findByOwnerAndName() {
			return null;
		},
		async create(input) {
			return {
				id: 'cat-new',
				name: input.name,
				icon: input.icon,
				ownerGroupId: input.ownerGroupId,
				createdAt: new Date()
			};
		},
		async addToGroup(groupId, categoryId) {
			addedToGroup.push({ groupId, categoryId });
		},
		async removeFromGroup() {},
		async delete() {},
		async update() {
			throw new Error('not implemented');
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
		const categoryRepo = fakeCategoryRepo();
		const uow = fakeUow({ groupRepo, groupMemberRepo, categoryRepo });
		const pairBalanceRepo = fakePairBalanceRepo();
		const service = createGroupService({ uow, groupRepo, pairBalanceRepo });

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

	it('links the new group to every default category', async () => {
		const groupRepo = fakeGroupRepo();
		const groupMemberRepo = fakeGroupMemberRepo();
		const defaults: Array<Category> = [
			{ id: 'cat-1', name: 'Rent', icon: '🏠', ownerGroupId: null, createdAt: new Date() },
			{ id: 'cat-2', name: 'Food', icon: '🍔', ownerGroupId: null, createdAt: new Date() }
		];
		const categoryRepo = fakeCategoryRepo(defaults);
		const uow = fakeUow({ groupRepo, groupMemberRepo, categoryRepo });
		const pairBalanceRepo = fakePairBalanceRepo();
		const service = createGroupService({ uow, groupRepo, pairBalanceRepo });

		const created = await service.createGroup({
			name: 'Trip',
			currencyCode: 'PHP',
			avatarIcon: null,
			creatorUserId: userId
		});

		expect(categoryRepo.addedToGroup).toEqual([
			{ groupId: created.id, categoryId: 'cat-1' },
			{ groupId: created.id, categoryId: 'cat-2' }
		]);
	});

	it('defaults currencyCode to PHP when not provided', async () => {
		const groupRepo = fakeGroupRepo();
		const groupMemberRepo = fakeGroupMemberRepo();
		const categoryRepo = fakeCategoryRepo();
		const uow = fakeUow({ groupRepo, groupMemberRepo, categoryRepo });
		const pairBalanceRepo = fakePairBalanceRepo();
		const service = createGroupService({ uow, groupRepo, pairBalanceRepo });

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
		const categoryRepo = fakeCategoryRepo();
		const uow = fakeUow({ groupRepo, groupMemberRepo, categoryRepo });
		const pairBalanceRepo = fakePairBalanceRepo();
		const service = createGroupService({ uow, groupRepo, pairBalanceRepo });

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

	it('deletes a group with no outstanding balances', async () => {
		const groupRepo = fakeGroupRepo();
		const groupMemberRepo = fakeGroupMemberRepo();
		const categoryRepo = fakeCategoryRepo();
		const pairBalanceRepo = fakePairBalanceRepo([]);
		const uow = fakeUow({ groupRepo, groupMemberRepo, categoryRepo });
		const service = createGroupService({ uow, groupRepo, pairBalanceRepo });

		await service.deleteGroup('group-1');

		expect(groupRepo.deleted).toEqual(['group-1']);
	});

	it('refuses to delete a group with an outstanding balance', async () => {
		const groupRepo = fakeGroupRepo();
		const groupMemberRepo = fakeGroupMemberRepo();
		const pairBalanceRepo = fakePairBalanceRepo([
			{ groupId: 'group-1', fromUserId: 'alice', toUserId: 'bob', amountCents: 500 }
		]);
		const categoryRepo = fakeCategoryRepo();
		const uow = fakeUow({ groupRepo, groupMemberRepo, categoryRepo });
		const service = createGroupService({ uow, groupRepo, pairBalanceRepo });

		await expect(service.deleteGroup('group-1')).rejects.toThrow();
		expect(groupRepo.deleted).toEqual([]);
	});
});
