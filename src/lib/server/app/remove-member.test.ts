import { describe, it, expect } from 'vitest';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import {
	createRemoveMemberService,
	HasOutstandingBalanceError,
	RemoverNotMemberOfGroupError,
	UserCannotRemoveItselfError,
	UserToRemoveNotMemberOfGroupError,
	type RemoveMemberRepos
} from './remove-member';

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
		async remove(gid, userId) {
			members.delete(userId);
			removed.push({ groupId: gid, userId });
		}
	};
}

function fakePairBalanceRepo(hasBalance: boolean): IPairBalanceRepository & {
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
			return [];
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
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo })
		});

		await service.kickUser(groupId, bob, alice);

		expect(groupMemberRepo.removed).toEqual([{ groupId, userId: bob }]);
		expect(members.has(bob)).toBe(false);
		expect(pairBalanceRepo.queried).toEqual([{ userId: bob, groupId }]);
	});

	it('throws UserToRemoveNotMemberOfGroupError when the target is not a member', async () => {
		const members = new Set([alice]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(false);
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo })
		});

		await expect(service.kickUser(groupId, bob, alice)).rejects.toBeInstanceOf(
			UserToRemoveNotMemberOfGroupError
		);
		expect(groupMemberRepo.removed).toEqual([]);
		expect(pairBalanceRepo.queried).toEqual([]);
	});

	it('throws RemoverNotMemberOfGroupError when the remover is not a member', async () => {
		const members = new Set([bob]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(false);
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo })
		});

		await expect(service.kickUser(groupId, bob, alice)).rejects.toBeInstanceOf(
			RemoverNotMemberOfGroupError
		);
		expect(groupMemberRepo.removed).toEqual([]);
		expect(pairBalanceRepo.queried).toEqual([]);
	});

	it('rejects removal when the target has an outstanding balance', async () => {
		const members = new Set([alice, bob]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(true);
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo })
		});

		await expect(service.kickUser(groupId, bob, alice)).rejects.toBeInstanceOf(
			HasOutstandingBalanceError
		);
		expect(groupMemberRepo.removed).toEqual([]);
		expect(members.has(bob)).toBe(true);
	});

	it('rejects self-removal', async () => {
		const members = new Set([alice, bob]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(false);
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo })
		});

		await expect(service.kickUser(groupId, alice, alice)).rejects.toBeInstanceOf(
			UserCannotRemoveItselfError
		);
		expect(groupMemberRepo.removed).toEqual([]);
		expect(members.has(alice)).toBe(true);
	});

	it('rejects self-removal even when the user has an outstanding balance', async () => {
		const members = new Set([alice, bob]);
		const groupMemberRepo = fakeGroupMemberRepo(members);
		const pairBalanceRepo = fakePairBalanceRepo(true);
		const service = createRemoveMemberService({
			uow: fakeUow({ pairBalanceRepo, groupMemberRepo })
		});

		await expect(service.kickUser(groupId, alice, alice)).rejects.toBeInstanceOf(
			UserCannotRemoveItselfError
		);
		expect(groupMemberRepo.removed).toEqual([]);
		expect(members.has(alice)).toBe(true);
		expect(pairBalanceRepo.queried).toEqual([]);
	});
});