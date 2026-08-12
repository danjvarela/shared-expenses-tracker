import { describe, it, expect } from 'vitest';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type {
	IExpenseRepository,
	ExpenseWithSplits
} from '$lib/server/app/interfaces/repositories/expense';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import type {
	IGroupMemberRepository,
	GroupMemberWithUser
} from '$lib/server/app/interfaces/repositories/group-member';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type {
	INotificationRepository,
	NotificationCreateInput
} from '$lib/server/app/interfaces/repositories/notification';
import type { Notification } from '$lib/server/domain/notification';
import { createExpenseService, type ExpenseRepos } from './expense';

const alice = 'alice';
const bob = 'bob';
const groupId = 'group-1';

function fakeGroupRepo(currencyCode = 'USD'): IGroupRepository {
	return {
		async getAll() {
			return [];
		},
		async getById(id) {
			return {
				id,
				name: 'Group',
				currencyCode,
				avatarIcon: null,
				createdAt: new Date()
			};
		},
		async create() {
			throw new Error('not implemented');
		},
		async update() {
			throw new Error('not implemented');
		},
		async delete() {}
	};
}

function fakeGroupMemberRepo(members: Array<GroupMemberWithUser>): IGroupMemberRepository {
	return {
		async getAllForGroupWithUser() {
			return members;
		},
		async create() {},
		async updateDefaultSplitPercents() {},
		async isMember() {
			return true;
		},
		async countByGroup() {
			return 0;
		},
		async remove() {}
	};
}

function fakeNotificationRepo(): INotificationRepository & {
	created: Array<NotificationCreateInput>;
} {
	const created: Array<NotificationCreateInput> = [];
	return {
		created,
		async create(input) {
			created.push(input);
			return {
				...input,
				id: `notification-${created.length}`,
				readAt: null,
				createdAt: new Date()
			} satisfies Notification;
		},
		async listForUser() {
			return [];
		},
		async getUnreadCountForUser() {
			return 0;
		},
		async markRead() {},
		async markAllReadForUser() {}
	};
}

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
				date: input.date,
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

describe('createExpenseService', () => {
	it('returns the expenses the repo reports for a group', async () => {
		const seed: ExpenseWithSplits = {
			id: 'expense-0',
			groupId,
			paidByUserId: alice,
			categoryId: null,
			description: 'Dinner',
			amountCents: 1000,
			date: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
			splits: []
		};
		const expenseRepo = fakeExpenseRepo([seed]);
		const service = createExpenseService({
			uow: fakeUnitOfWork({ expenseRepo, pairBalanceRepo: fakePairBalanceRepo() }),
			expenseRepo,
			groupRepo: fakeGroupRepo(),
			groupMemberRepo: fakeGroupMemberRepo([]),
			notificationRepo: fakeNotificationRepo()
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
			expenseRepo,
			groupRepo: fakeGroupRepo(),
			groupMemberRepo: fakeGroupMemberRepo([]),
			notificationRepo: fakeNotificationRepo()
		});

		const created = await service.createExpense(
			{
				groupId,
				paidByUserId: alice,
				categoryId: null,
				description: 'Dinner',
				amountCents: 1000,
				date: new Date(),
				splits: [
					{ userId: alice, amountCents: 500 },
					{ userId: bob, amountCents: 500 }
				]
			},
			alice
		);

		expect(created.id).toBeDefined();
		expect(pairBalanceRepo.deltasApplied).toEqual([
			{ groupId, fromUserId: bob, toUserId: alice, amountCents: 500 }
		]);
	});

	it('notifies other group members but not the actor when an expense is created', async () => {
		const expenseRepo = fakeExpenseRepo();
		const notificationRepo = fakeNotificationRepo();
		const service = createExpenseService({
			uow: fakeUnitOfWork({ expenseRepo, pairBalanceRepo: fakePairBalanceRepo() }),
			expenseRepo,
			groupRepo: fakeGroupRepo('USD'),
			groupMemberRepo: fakeGroupMemberRepo([
				{ userId: alice, displayName: 'Alice', defaultSplitPercent: null },
				{ userId: bob, displayName: 'Bob', defaultSplitPercent: null }
			]),
			notificationRepo
		});

		const created = await service.createExpense(
			{
				groupId,
				paidByUserId: alice,
				categoryId: null,
				description: 'Dinner',
				amountCents: 1000,
				date: new Date(),
				splits: [
					{ userId: alice, amountCents: 500 },
					{ userId: bob, amountCents: 500 }
				]
			},
			alice
		);

		expect(notificationRepo.created).toEqual([
			{
				userId: bob,
				groupId,
				type: 'expense_created',
				expenseId: created.id,
				settlementId: null,
				message: 'Alice added Dinner ($10.00)'
			}
		]);
	});

	it('swallows notification failures without failing expense creation', async () => {
		const expenseRepo = fakeExpenseRepo();
		const notificationRepo = fakeNotificationRepo();
		const groupMemberRepo: IGroupMemberRepository = {
			async getAllForGroupWithUser() {
				throw new Error('boom');
			},
			async create() {},
			async updateDefaultSplitPercents() {},
			async isMember() {
				return true;
			},
			async countByGroup() {
				return 0;
			},
			async remove() {}
		};
		const service = createExpenseService({
			uow: fakeUnitOfWork({ expenseRepo, pairBalanceRepo: fakePairBalanceRepo() }),
			expenseRepo,
			groupRepo: fakeGroupRepo(),
			groupMemberRepo,
			notificationRepo
		});

		const created = await service.createExpense(
			{
				groupId,
				paidByUserId: alice,
				categoryId: null,
				description: 'Dinner',
				amountCents: 1000,
				date: new Date(),
				splits: []
			},
			alice
		);

		expect(created.id).toBeDefined();
		expect(notificationRepo.created).toEqual([]);
	});

	it('throws when updating an expense that does not exist', async () => {
		const expenseRepo = fakeExpenseRepo();
		const service = createExpenseService({
			uow: fakeUnitOfWork({
				expenseRepo,
				pairBalanceRepo: fakePairBalanceRepo()
			}),
			expenseRepo,
			groupRepo: fakeGroupRepo(),
			groupMemberRepo: fakeGroupMemberRepo([]),
			notificationRepo: fakeNotificationRepo()
		});

		await expect(
			service.updateExpense('missing', {
				paidByUserId: alice,
				categoryId: null,
				description: 'x',
				amountCents: 100,
				date: new Date(),
				splits: []
			})
		).rejects.toThrow('Expense not found');
	});

	it('reverses old deltas and applies new ones on delete', async () => {
		const seed: ExpenseWithSplits = {
			id: 'expense-0',
			groupId,
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
			expenseRepo,
			groupRepo: fakeGroupRepo(),
			groupMemberRepo: fakeGroupMemberRepo([]),
			notificationRepo: fakeNotificationRepo()
		});

		await service.deleteExpense('expense-0');

		expect(pairBalanceRepo.deltasApplied).toEqual([
			{ groupId, fromUserId: alice, toUserId: bob, amountCents: 500 }
		]);
	});
});
