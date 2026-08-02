import { describe, it, expect } from 'vitest';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type {
	IExpenseRepository,
	ExpenseWithSplits
} from '$lib/server/app/interfaces/repositories/expense';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import { createExpenseService, type ExpenseRepos } from './expense';

const alice = 'alice';
const bob = 'bob';
const groupId = 'group-1';

function fakeUnitOfWork(repos: ExpenseRepos): IUnitOfWork<ExpenseRepos> {
	return {
		async run(fn) {
			return fn(repos);
		}
	};
}

function fakeExpenseRepo(seed: Array<ExpenseWithSplits> = []): IExpenseRepository {
	const rows = new Map(seed.map((row) => [row.id, row]));
	let nextId = seed.length;

	function toSplits(expenseId: string, splits: Array<{ userId: string; amountCents: number }>) {
		return splits.map((split, index) => ({
			id: `split-${expenseId}-${index}`,
			expenseId,
			userId: split.userId,
			amountCents: split.amountCents,
			createdAt: new Date()
		}));
	}

	return {
		async create(input) {
			const id = `expense-${nextId++}`;
			const row: ExpenseWithSplits = {
				id,
				groupId: input.groupId,
				paidByUserId: input.paidByUserId,
				categoryId: input.categoryId,
				description: input.description,
				amountCents: input.amountCents,
				createdAt: new Date(),
				updatedAt: new Date(),
				splits: toSplits(id, input.splits)
			};
			rows.set(id, row);
			return row;
		},
		async getWithSplits(id) {
			return rows.get(id) ?? null;
		},
		async update(id, input) {
			const existing = rows.get(id);
			if (!existing) throw new Error(`not found: ${id}`);
			const updated: ExpenseWithSplits = {
				...existing,
				...input,
				splits: toSplits(id, input.splits)
			};
			rows.set(id, updated);
			return updated;
		},
		async delete(id) {
			rows.delete(id);
		},
		async getAllForGroupWithSplits(groupId) {
			return Array.from(rows.values()).filter((row) => row.groupId === groupId);
		},
		async getAllForGroupWithDetails(groupId) {
			return Array.from(rows.values())
				.filter((row) => row.groupId === groupId)
				.map((row) => ({
					...row,
					paidByName: row.paidByUserId,
					categoryName: null,
					categoryIcon: null
				}));
		}
	};
}

function fakePairBalanceRepo(): IPairBalanceRepository & {
	deltasApplied: Array<{
		groupId: string;
		fromUserId: string;
		toUserId: string;
		amountCents: number;
	}>;
} {
	const rows = new Map<string, { fromUserId: string; toUserId: string; amountCents: number }>();
	const deltasApplied: Array<{
		groupId: string;
		fromUserId: string;
		toUserId: string;
		amountCents: number;
	}> = [];
	const key = (a: string, b: string) => [a, b].sort().join('|');

	return {
		deltasApplied,
		async getForPair(_groupId, userA, userB) {
			return rows.get(key(userA, userB)) ?? null;
		},
		async replaceForPair(groupId, userA, userB, next) {
			if (next) {
				rows.set(key(userA, userB), next);
				deltasApplied.push({ groupId, ...next });
			} else {
				rows.delete(key(userA, userB));
			}
		},
		async getAllForGroup() {
			return [];
		},
		async getNetForUserInGroups() {
			return new Map();
		},
		async replaceAllForGroup() {}
	};
}

describe('createExpenseService', () => {
	it('returns the expenses the repo reports for a group', async () => {
		const seed: ExpenseWithSplits = {
			id: 'expense-0',
			groupId,
			paidByUserId: alice,
			categoryId: null,
			description: 'Dinner',
			amountCents: 1000,
			createdAt: new Date(),
			updatedAt: new Date(),
			splits: []
		};
		const expenseRepo = fakeExpenseRepo([seed]);
		const service = createExpenseService({
			uow: fakeUnitOfWork({ expenseRepo, pairBalanceRepo: fakePairBalanceRepo() }),
			expenseRepo
		});

		expect(await service.getGroupExpenses(groupId)).toEqual([
			{ ...seed, paidByName: alice, categoryName: null, categoryIcon: null }
		]);
		expect(await service.getGroupExpenses('other-group')).toEqual([]);
	});

	it('creates an expense and applies pair balance deltas within the unit of work', async () => {
		const expenseRepo = fakeExpenseRepo();
		const pairBalanceRepo = fakePairBalanceRepo();
		const service = createExpenseService({
			uow: fakeUnitOfWork({ expenseRepo, pairBalanceRepo }),
			expenseRepo
		});

		const created = await service.createExpense({
			groupId,
			paidByUserId: alice,
			categoryId: null,
			description: 'Dinner',
			amountCents: 1000,
			splits: [
				{ userId: alice, amountCents: 500 },
				{ userId: bob, amountCents: 500 }
			]
		});

		expect(created.id).toBeDefined();
		expect(pairBalanceRepo.deltasApplied).toEqual([
			{ groupId, fromUserId: bob, toUserId: alice, amountCents: 500 }
		]);
	});

	it('throws when updating an expense that does not exist', async () => {
		const expenseRepo = fakeExpenseRepo();
		const service = createExpenseService({
			uow: fakeUnitOfWork({
				expenseRepo,
				pairBalanceRepo: fakePairBalanceRepo()
			}),
			expenseRepo
		});

		await expect(
			service.updateExpense('missing', {
				paidByUserId: alice,
				categoryId: null,
				description: 'x',
				amountCents: 100,
				splits: []
			})
		).rejects.toThrow('Expense not found: missing');
	});

	it('reverses old deltas and applies new ones on delete', async () => {
		const seed: ExpenseWithSplits = {
			id: 'expense-0',
			groupId,
			paidByUserId: alice,
			categoryId: null,
			description: 'Dinner',
			amountCents: 1000,
			createdAt: new Date(),
			updatedAt: new Date(),
			splits: [
				{
					id: 'split-1',
					expenseId: 'expense-0',
					userId: alice,
					amountCents: 500,
					createdAt: new Date()
				},
				{
					id: 'split-2',
					expenseId: 'expense-0',
					userId: bob,
					amountCents: 500,
					createdAt: new Date()
				}
			]
		};
		const expenseRepo = fakeExpenseRepo([seed]);
		const pairBalanceRepo = fakePairBalanceRepo();
		const service = createExpenseService({
			uow: fakeUnitOfWork({ expenseRepo, pairBalanceRepo }),
			expenseRepo
		});

		await service.deleteExpense('expense-0');

		expect(pairBalanceRepo.deltasApplied).toEqual([
			{ groupId, fromUserId: alice, toUserId: bob, amountCents: 500 }
		]);
	});
});
