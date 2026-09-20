import { describe, it, expect } from 'vitest';
import type {
	IExpenseRepository,
	ExpenseWithSplits
} from '$lib/server/app/interfaces/repositories/expense';
import type { ISettlementRepository } from '$lib/server/app/interfaces/repositories/settlement';
import type {
	IPairBalanceRepository,
	UserDebt
} from '$lib/server/app/interfaces/repositories/pair-balance';
import type { PairBalance } from '$lib/server/domain/pair-balance';
import { createGroupBalanceService } from './group-balance';

const alice = 'alice';
const bob = 'bob';
const groupId = 'group-1';

function fakeExpenseRepo(expenses: Array<ExpenseWithSplits>): IExpenseRepository {
	return {
		async create() {
			throw new Error('not implemented');
		},
		async getWithSplits() {
			throw new Error('not implemented');
		},
		async update() {
			throw new Error('not implemented');
		},
		async delete() {
			throw new Error('not implemented');
		},
		async countByExpenseGroup() {
			throw new Error('not implemented');
		},
		async getAllForGroupWithDetails() {
			throw new Error('not implemented');
		},
		async getAllForExpenseGroupWithDetails() {
			throw new Error('not implemented');
		},
		async getAllForGroupWithSplits(groupId) {
			return expenses.filter((expense) => expense.groupId === groupId);
		}
	};
}

function fakeSettlementRepo(): ISettlementRepository {
	return {
		async create() {
			throw new Error('not implemented');
		},
		async getAllForGroup() {
			return [];
		},
		async getById() {
			throw new Error('not implemented');
		}
	};
}

function fakePairBalanceRepo(
	debts: Array<UserDebt> = []
): IPairBalanceRepository & { replaced: Array<Array<unknown>> } {
	let stored: Array<PairBalance> = [];
	const replaced: Array<Array<unknown>> = [];

	return {
		replaced,
		async getForPair() {
			return null;
		},
		async replaceForPair() {},
		async getAllForGroup() {
			return stored;
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
		async getDebtsForUserInGroup(_userId, groupId) {
			return debts.filter((debt) => debt.groupId === groupId);
		},
		async replaceAllForGroup(groupId, balances) {
			replaced.push(balances);
			stored = balances.map((balance, index) => ({
				id: `pair-${index}`,
				groupId,
				createdAt: new Date(),
				updatedAt: new Date(),
				...balance
			}));
		}
	};
}

describe('createGroupBalanceService', () => {
	it('recomputes group balances from expenses and settlements', async () => {
		const expense: ExpenseWithSplits = {
			id: 'expense-1',
			groupId,
			expenseGroupId: 'expense-group-1',
			paidByUserId: alice,
			categoryId: null,
			description: 'Dinner',
			amountCents: 1000,
			date: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
			splits: [
				{
					id: 'split-1',
					expenseId: 'expense-1',
					userId: alice,
					amountCents: 500,
					createdAt: new Date()
				},
				{
					id: 'split-2',
					expenseId: 'expense-1',
					userId: bob,
					amountCents: 500,
					createdAt: new Date()
				}
			]
		};
		const pairBalanceRepo = fakePairBalanceRepo();
		const service = createGroupBalanceService({
			expenseRepo: fakeExpenseRepo([expense]),
			settlementRepo: fakeSettlementRepo(),
			pairBalanceRepo
		});

		await service.recomputeGroupBalances(groupId);

		expect(pairBalanceRepo.replaced).toEqual([
			[{ fromUserId: bob, toUserId: alice, amountCents: 500 }]
		]);
		expect(await service.getGroupBalances(groupId)).toHaveLength(1);
	});

	it('delegates getDebtsForUserInGroup to the repository, scoped to the group', async () => {
		const debt: UserDebt = {
			groupId,
			groupName: 'Trip',
			groupCurrencyCode: 'USD',
			groupAvatarIcon: null,
			counterpartyId: bob,
			counterpartyName: 'Bob',
			counterpartyAvatarStorageKey: null,
			amountCents: 500
		};
		const otherGroupDebt: UserDebt = { ...debt, groupId: 'group-2' };
		const service = createGroupBalanceService({
			expenseRepo: fakeExpenseRepo([]),
			settlementRepo: fakeSettlementRepo(),
			pairBalanceRepo: fakePairBalanceRepo([debt, otherGroupDebt])
		});

		expect(await service.getDebtsForUserInGroup(alice, groupId)).toEqual([debt]);
	});
});
