import { describe, it, expect } from 'vitest';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import {
	applyPairDelta,
	applyPairBalanceDeltas,
	expenseDeltas,
	settlementDelta,
	recomputeGroupBalances,
	netDeltas,
	pairKey
} from './pair-balance';

const alice = 'alice';
const bob = 'bob';
const carol = 'carol';
const groupId = 'group-1';

function fakePairBalanceRepo(): IPairBalanceRepository {
	const rows = new Map<string, { fromUserId: string; toUserId: string; amountCents: number }>();

	return {
		async getForPair(_groupId, userA, userB) {
			return rows.get(pairKey(userA, userB)) ?? null;
		},
		async replaceForPair(_groupId, userA, userB, next) {
			const key = pairKey(userA, userB);
			if (next) rows.set(key, next);
			else rows.delete(key);
		},
		async getAllForGroup(groupId) {
			return Array.from(rows.entries()).map(([, value], index) => ({
				id: `row-${index}`,
				groupId,
				createdAt: new Date(),
				updatedAt: new Date(),
				...value
			}));
		},
		async getNetForUserInGroups() {
			return new Map();
		},
		async getDebtsForUser() {
			return [];
		},
		async replaceAllForGroup(_groupId, balances) {
			rows.clear();
			for (const balance of balances) {
				rows.set(pairKey(balance.fromUserId, balance.toUserId), balance);
			}
		}
	};
}

describe('applyPairDelta', () => {
	it('creates a new balance from no existing row', () => {
		expect(applyPairDelta(null, alice, bob, 500)).toEqual({
			fromUserId: alice,
			toUserId: bob,
			amountCents: 500
		});
	});

	it('adds to an existing balance in the same direction', () => {
		const current = { fromUserId: alice, toUserId: bob, amountCents: 500 };
		expect(applyPairDelta(current, alice, bob, 200)).toEqual({
			fromUserId: alice,
			toUserId: bob,
			amountCents: 700
		});
	});

	it('nets against an existing balance in the opposite direction', () => {
		const current = { fromUserId: alice, toUserId: bob, amountCents: 500 };
		expect(applyPairDelta(current, bob, alice, 200)).toEqual({
			fromUserId: alice,
			toUserId: bob,
			amountCents: 300
		});
	});

	it('flips direction when the opposite delta overtakes the current balance', () => {
		const current = { fromUserId: alice, toUserId: bob, amountCents: 500 };
		expect(applyPairDelta(current, bob, alice, 800)).toEqual({
			fromUserId: bob,
			toUserId: alice,
			amountCents: 300
		});
	});

	it('returns null when the net is exactly zero', () => {
		const current = { fromUserId: alice, toUserId: bob, amountCents: 500 };
		expect(applyPairDelta(current, bob, alice, 500)).toBeNull();
	});
});

describe('expenseDeltas', () => {
	it('excludes the payer split and charges each other participant to the payer', () => {
		const deltas = expenseDeltas(alice, [
			{ userId: alice, amountCents: 1000 },
			{ userId: bob, amountCents: 500 },
			{ userId: carol, amountCents: 500 }
		]);

		expect(deltas).toEqual([
			{ userA: bob, userB: alice, deltaAToB: 500 },
			{ userA: carol, userB: alice, deltaAToB: 500 }
		]);
	});
});

describe('settlementDelta', () => {
	it('reduces the payer debt to the recipient', () => {
		expect(settlementDelta({ fromUserId: bob, toUserId: alice, amountCents: 300 })).toEqual({
			userA: bob,
			userB: alice,
			deltaAToB: -300
		});
	});
});

describe('pairKey', () => {
	it('is order-independent', () => {
		expect(pairKey(alice, bob)).toBe(pairKey(bob, alice));
	});
});

describe('netDeltas', () => {
	it('nets multiple deltas across the same and different pairs', () => {
		const result = netDeltas([
			{ userA: bob, userB: alice, deltaAToB: 500 },
			{ userA: carol, userB: alice, deltaAToB: 500 },
			{ userA: alice, userB: bob, deltaAToB: 200 }
		]);

		expect(result.get(pairKey(alice, bob))).toEqual({
			fromUserId: bob,
			toUserId: alice,
			amountCents: 300
		});
		expect(result.get(pairKey(alice, carol))).toEqual({
			fromUserId: carol,
			toUserId: alice,
			amountCents: 500
		});
	});

	it('drops pairs that net to zero', () => {
		const result = netDeltas([
			{ userA: bob, userB: alice, deltaAToB: 500 },
			{ userA: alice, userB: bob, deltaAToB: 500 }
		]);

		expect(result.has(pairKey(alice, bob))).toBe(false);
	});
});

describe('incremental application vs recompute', () => {
	it('matches recomputeGroupBalances after a sequence of expense and settlement writes', async () => {
		const expenses = [
			{
				paidByUserId: alice,
				splits: [
					{ userId: alice, amountCents: 600 },
					{ userId: bob, amountCents: 300 },
					{ userId: carol, amountCents: 300 }
				]
			},
			{
				paidByUserId: bob,
				splits: [
					{ userId: alice, amountCents: 500 },
					{ userId: bob, amountCents: 500 }
				]
			},
			{
				paidByUserId: carol,
				splits: [
					{ userId: alice, amountCents: 100 },
					{ userId: bob, amountCents: 100 },
					{ userId: carol, amountCents: 100 }
				]
			}
		];
		const settlements = [{ fromUserId: bob, toUserId: alice, amountCents: 200 }];

		const incrementalRepo = fakePairBalanceRepo();
		for (const expense of expenses) {
			await applyPairBalanceDeltas(
				incrementalRepo,
				groupId,
				expenseDeltas(expense.paidByUserId, expense.splits)
			);
		}
		for (const settlement of settlements) {
			await applyPairBalanceDeltas(incrementalRepo, groupId, [settlementDelta(settlement)]);
		}
		const incrementalResult = await incrementalRepo.getAllForGroup(groupId);

		const recomputeRepo = fakePairBalanceRepo();
		await recomputeGroupBalances(recomputeRepo, groupId, expenses, settlements);
		const recomputeResult = await recomputeRepo.getAllForGroup(groupId);

		const normalize = (
			rows: Array<{ fromUserId: string; toUserId: string; amountCents: number }>
		) =>
			rows
				.map(({ fromUserId, toUserId, amountCents }) => ({ fromUserId, toUserId, amountCents }))
				.sort((a, b) =>
					pairKey(a.fromUserId, a.toUserId).localeCompare(pairKey(b.fromUserId, b.toUserId))
				);

		expect(normalize(incrementalResult)).toEqual(normalize(recomputeResult));
	});
});
