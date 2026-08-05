import { describe, it, expect } from 'vitest';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import { createGroupMemberService } from './group-member';

const groupId = 'group-1';
const alice = 'alice';
const bob = 'bob';

function fakeGroupMemberRepo(
	seed: Array<{ userId: string; displayName: string; defaultSplitPercent: number | null }>
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
		}
	};
}

describe('createGroupMemberService', () => {
	it('returns the members the repo reports for a group', async () => {
		const groupMemberRepo = fakeGroupMemberRepo([
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: 60 },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null }
		]);
		const service = createGroupMemberService({ groupMemberRepo });

		expect(await service.getGroupMembers(groupId)).toEqual([
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: 60 },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null }
		]);
	});

	it('saves default split percentages that sum to 100', async () => {
		const groupMemberRepo = fakeGroupMemberRepo([
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null }
		]);
		const service = createGroupMemberService({ groupMemberRepo });

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
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: 60 },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: 40 }
		]);
		const service = createGroupMemberService({ groupMemberRepo });

		await service.updateDefaultSplitPercents(groupId, [
			{ userId: alice, defaultSplitPercent: null },
			{ userId: bob, defaultSplitPercent: null }
		]);

		expect(groupMemberRepo.updates).toHaveLength(1);
	});

	it('rejects a save where the set percentages do not sum to 100', async () => {
		const groupMemberRepo = fakeGroupMemberRepo([
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null }
		]);
		const service = createGroupMemberService({ groupMemberRepo });

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
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null }
		]);
		const service = createGroupMemberService({ groupMemberRepo });

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
});
