import { describe, it, expect } from 'vitest';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import {
	createRemoveMemberService,
	HasOutstandingBalanceError,
	RemoverNotMemberOfGroupError,
	UserToRemoveNotMemberOfGroupError,
	type RemoveMemberRepos
} from './remove-member';
import { GroupHasOutstandingBalanceError } from './group';

const groupId = 'group-1';
const alice = 'alice';
const bob = 'bob';

function fakeGroupMemberRepo(members: Set<string>): IGroupMemberRepository & {
	removed: Array<{ groupId: string; userId: string }>;
} {
	const removed: Array<{ groupId: string; userId: string }> = [];
	return {
		removed,
		async getAllForGroupWithUser() {
			return [];
		},
		async create() {},
		async updateDefaultSplitPercents() {},
		async isMember(_gid, userId) {
			return members.has(userId);
		},
		async countByGroup() {
			return members.size;
		},
		async remove(gid, userId) {
			members.delete(userId);
			removed.push({ groupId: gid, userId });
		}
	};
}

function fakePairBalanceRepo(
	hasBalance: boolean,
	groupBalances: Array<{ fromUserId: string; toUserId: string; amountCents: number }> = []
): IPairBalanceRepository & {
	queried: Array<{ userId: string; groupId: string }>;
} {
	const queried: Array<{ userId: string; groupId: string }> = [];
	return {
		queried,
		async getForPair() {
			return null;
		},
		async replaceForPair() {},
		async getAllForGroup() {
			return groupBalances as Array<never>;
		},
		async getNetForUserInGroups() {
			return new Map();
		},
		async hasBalanceForUserInGroup(userId, gid) {
			queried.push({ userId, groupId: gid });
			return hasBalance;
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

function fakeGroupRepo(): IGroupRepository & {
	deleted: Array<string>;
} {
	const deleted: Array<string> = [];
	return {
		deleted,
		async getAll() {
			return [];
		},
		async getById() {
			return null;
		},
		async create() {
			throw new Error('not used');
		},
		async update() {
			throw new Error('not used');
		},
		async delete(id) {
			deleted.push(id);
		}
	};
}

function fakeUow(repos: RemoveMemberRepos): IUnitOfWork<RemoveMemberRepos> {
	return {
		async run(fn) {
			return fn(repos);
		}
	};
}

describe('createRemoveMemberService', () => {
	it('removes a zero-balance member from the group', async () => {
		const members = new Set([alice, bob]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(false);
		const groupRepo = fakeGroupRepo();
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo, groupRepo })
		});

		const result = await service.kickUser(groupId, bob, alice);

		expect(result).toBe('removed');
		expect(groupMemberRepo.removed).toEqual([{ groupId, userId: bob }]);
		expect(members.has(bob)).toBe(false);
		expect(pairBalanceRepo.queried).toEqual([{ userId: bob, groupId }]);
		expect(groupRepo.deleted).toEqual([]);
	});

	it('throws UserToRemoveNotMemberOfGroupError when the target is not a member', async () => {
		const members = new Set([alice]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(false);
		const groupRepo = fakeGroupRepo();
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo, groupRepo })
		});

		await expect(service.kickUser(groupId, bob, alice)).rejects.toBeInstanceOf(
			UserToRemoveNotMemberOfGroupError
		);
		expect(groupMemberRepo.removed).toEqual([]);
		expect(pairBalanceRepo.queried).toEqual([]);
		expect(groupRepo.deleted).toEqual([]);
	});

	it('throws RemoverNotMemberOfGroupError when the remover is not a member', async () => {
		const members = new Set([bob]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(false);
		const groupRepo = fakeGroupRepo();
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo, groupRepo })
		});

		await expect(service.kickUser(groupId, bob, alice)).rejects.toBeInstanceOf(
			RemoverNotMemberOfGroupError
		);
		expect(groupMemberRepo.removed).toEqual([]);
		expect(pairBalanceRepo.queried).toEqual([]);
		expect(groupRepo.deleted).toEqual([]);
	});

	it('rejects removal when the target has an outstanding balance', async () => {
		const members = new Set([alice, bob]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(true);
		const groupRepo = fakeGroupRepo();
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo, groupRepo })
		});

		await expect(service.kickUser(groupId, bob, alice)).rejects.toBeInstanceOf(
			HasOutstandingBalanceError
		);
		expect(groupMemberRepo.removed).toEqual([]);
		expect(members.has(bob)).toBe(true);
		expect(groupRepo.deleted).toEqual([]);
	});

	it('lets a member leave a multi-member group without a balance check', async () => {
		const members = new Set([alice, bob]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(true);
		const groupRepo = fakeGroupRepo();
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo, groupRepo })
		});

		const result = await service.kickUser(groupId, alice, alice);

		expect(result).toBe('removed');
		expect(groupMemberRepo.removed).toEqual([{ groupId, userId: alice }]);
		expect(members.has(alice)).toBe(false);
		expect(pairBalanceRepo.queried).toEqual([]);
		expect(groupRepo.deleted).toEqual([]);
	});

	it('deletes the group when the sole member leaves', async () => {
		const members = new Set([alice]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(false);
		const groupRepo = fakeGroupRepo();
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo, groupRepo })
		});

		const result = await service.kickUser(groupId, alice, alice);

		expect(result).toBe('group-deleted');
		expect(groupRepo.deleted).toEqual([groupId]);
		expect(groupMemberRepo.removed).toEqual([]);
	});

	it('throws RemoverNotMemberOfGroupError when a non-member tries to leave', async () => {
		const members = new Set([bob]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(false);
		const groupRepo = fakeGroupRepo();
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo, groupRepo })
		});

		await expect(service.kickUser(groupId, alice, alice)).rejects.toBeInstanceOf(
			RemoverNotMemberOfGroupError
		);
		expect(groupRepo.deleted).toEqual([]);
		expect(groupMemberRepo.removed).toEqual([]);
	});

	it('refuses to delete the group on leave if an outstanding balance somehow remains', async () => {
		const members = new Set([alice]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(false, [
			{ fromUserId: alice, toUserId: 'ghost', amountCents: 100 }
		]);
		const groupRepo = fakeGroupRepo();
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo, groupRepo })
		});

		await expect(service.kickUser(groupId, alice, alice)).rejects.toBeInstanceOf(
			GroupHasOutstandingBalanceError
		);
		expect(groupRepo.deleted).toEqual([]);
		expect(groupMemberRepo.removed).toEqual([]);
	});
});
