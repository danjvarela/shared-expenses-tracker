import { describe, it, expect } from 'vitest';
import type {
	IGroupMemberRepository,
	GroupMemberWithUser
} from '$lib/server/app/interfaces/repositories/group-member';
import type { IIdentityRepository } from '$lib/server/app/interfaces/repositories/identity';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import { createGroupMemberService } from './group-member';

const groupId = 'group-1';
const alice = 'alice';
const bob = 'bob';

function fakeIdentityRepo(identities: Set<string>): IIdentityRepository {
	return {
		async findByProviderSubject() {
			return null;
		},
		async findByUserIdAndProvider() {
			return null;
		},
		async create() {
			return {} as never;
		},
		async hasIdentityForUser(userId) {
			return identities.has(userId);
		},
		async deleteAllForUser() {}
	};
}

function fakePairBalanceRepo(usersWithBalance: Set<string>): IPairBalanceRepository {
	return {
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
		async hasBalanceForUserInGroup(userId) {
			return usersWithBalance.has(userId);
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

function fakeGroupMemberRepo(
	seed: Array<GroupMemberWithUser>
): IGroupMemberRepository & { updates: Array<unknown> } {
	const rows = new Map(seed.map((row) => [row.userId, row]));
	const updates: Array<unknown> = [];

	return {
		updates,
		async getAllForGroupWithUser() {
			return Array.from(rows.values());
		},
		async create() {},
		async updateDefaultSplitPercents(groupId, entries) {
			updates.push({ groupId, entries });
			for (const entry of entries) {
				const existing = rows.get(entry.userId);
				if (existing) existing.defaultSplitPercent = entry.defaultSplitPercent;
			}
		},
		async isMember(_groupId, userId) {
			return rows.has(userId);
		},
		async countByGroup() {
			return rows.size;
		},
		async remove(_groupId, userId) {
			rows.delete(userId);
		},
		async getGroupIdsForUser() {
			return [];
		}
	};
}

describe('createGroupMemberService', () => {
	it('returns the members the repo reports for a group', async () => {
		const groupMemberRepo = fakeGroupMemberRepo([
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: 60, avatarStorageKey: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null, avatarStorageKey: null }
		]);
		const service = createGroupMemberService({
			groupMemberRepo,
			identityRepo: fakeIdentityRepo(new Set()),
			pairBalanceRepo: fakePairBalanceRepo(new Set())
		});

		expect(await service.getGroupMembers(groupId)).toEqual([
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: 60, avatarStorageKey: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null, avatarStorageKey: null }
		]);
	});

	it('saves default split percentages that sum to 100', async () => {
		const groupMemberRepo = fakeGroupMemberRepo([
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: null, avatarStorageKey: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null, avatarStorageKey: null }
		]);
		const service = createGroupMemberService({
			groupMemberRepo,
			identityRepo: fakeIdentityRepo(new Set()),
			pairBalanceRepo: fakePairBalanceRepo(new Set())
		});

		await service.updateDefaultSplitPercents(groupId, [
			{ userId: alice, defaultSplitPercent: 60 },
			{ userId: bob, defaultSplitPercent: 40 }
		]);

		expect(groupMemberRepo.updates).toEqual([
			{
				groupId,
				entries: [
					{ userId: alice, defaultSplitPercent: 60 },
					{ userId: bob, defaultSplitPercent: 40 }
				]
			}
		]);
	});

	it('allows resetting every member back to unset', async () => {
		const groupMemberRepo = fakeGroupMemberRepo([
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: 60, avatarStorageKey: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: 40, avatarStorageKey: null }
		]);
		const service = createGroupMemberService({
			groupMemberRepo,
			identityRepo: fakeIdentityRepo(new Set()),
			pairBalanceRepo: fakePairBalanceRepo(new Set())
		});

		await service.updateDefaultSplitPercents(groupId, [
			{ userId: alice, defaultSplitPercent: null },
			{ userId: bob, defaultSplitPercent: null }
		]);

		expect(groupMemberRepo.updates).toHaveLength(1);
	});

	it('rejects a save where the set percentages do not sum to 100', async () => {
		const groupMemberRepo = fakeGroupMemberRepo([
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: null, avatarStorageKey: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null, avatarStorageKey: null }
		]);
		const service = createGroupMemberService({
			groupMemberRepo,
			identityRepo: fakeIdentityRepo(new Set()),
			pairBalanceRepo: fakePairBalanceRepo(new Set())
		});

		await expect(
			service.updateDefaultSplitPercents(groupId, [
				{ userId: alice, defaultSplitPercent: 60 },
				{ userId: bob, defaultSplitPercent: 30 }
			])
		).rejects.toThrow('Default split percentages must sum to 100, got 90');

		expect(groupMemberRepo.updates).toHaveLength(0);
	});

	it('allows a newly-joined member to stay unset while others are set, as long as the set ones sum to 100', async () => {
		const groupMemberRepo = fakeGroupMemberRepo([
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: null, avatarStorageKey: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null, avatarStorageKey: null }
		]);
		const service = createGroupMemberService({
			groupMemberRepo,
			identityRepo: fakeIdentityRepo(new Set()),
			pairBalanceRepo: fakePairBalanceRepo(new Set())
		});

		await service.updateDefaultSplitPercents(groupId, [
			{ userId: alice, defaultSplitPercent: 100 },
			{ userId: bob, defaultSplitPercent: null }
		]);

		expect(groupMemberRepo.updates).toEqual([
			{
				groupId,
				entries: [
					{ userId: alice, defaultSplitPercent: 100 },
					{ userId: bob, defaultSplitPercent: null }
				]
			}
		]);
	});

	it('exposes per-member invited-pending and outstanding-balance flags', async () => {
		const groupMemberRepo = fakeGroupMemberRepo([
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: 60, avatarStorageKey: null },
			{
				userId: bob,
				displayName: 'bob@example.com',
				defaultSplitPercent: 40,
				avatarStorageKey: null
			},
			{
				userId: 'cara',
				displayName: 'cara@example.com',
				defaultSplitPercent: null,
				avatarStorageKey: null
			}
		]);
		const identities = new Set<string>([alice]);
		const usersWithBalance = new Set<string>(['cara']);
		const service = createGroupMemberService({
			groupMemberRepo,
			identityRepo: fakeIdentityRepo(identities),
			pairBalanceRepo: fakePairBalanceRepo(usersWithBalance)
		});

		expect(await service.getGroupMembersWithStatus(groupId)).toEqual([
			{
				userId: alice,
				displayName: 'Alice',
				defaultSplitPercent: 60,
				avatarStorageKey: null,
				invitedPending: false,
				hasOutstandingBalance: false
			},
			{
				userId: bob,
				displayName: 'bob@example.com',
				defaultSplitPercent: 40,
				avatarStorageKey: null,
				invitedPending: true,
				hasOutstandingBalance: false
			},
			{
				userId: 'cara',
				displayName: 'cara@example.com',
				defaultSplitPercent: null,
				avatarStorageKey: null,
				invitedPending: true,
				hasOutstandingBalance: true
			}
		]);
	});
});
