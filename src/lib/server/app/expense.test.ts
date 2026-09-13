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
	IExpenseGroupRepository,
	ExpenseGroupCreateInput
} from '$lib/server/app/interfaces/repositories/expense-group';
import type { ExpenseGroup } from '$lib/server/domain/expense-group';
import type {
	INotificationRepository,
	NotificationCreateInput
} from '$lib/server/app/interfaces/repositories/notification';
import type { Notification } from '$lib/server/domain/notification';
import {
	createExpenseService,
	FormerMemberSplitNotEditableError,
	ExpenseSplitsDoNotSumError,
	PaidByCannotChangeWithFormerMemberError,
	type ExpenseRepos
} from './expense';

const alice = 'alice';
const bob = 'bob';
const carol = 'carol';
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
		async remove() {},
		async getGroupIdsForUser() {
			return [];
		}
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
				expenseGroupId: input.expenseGroupId,
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
			const row = rows.get(id);
			if (!row) return null;
			return {
				...row,
				paidByName: row.paidByUserId,
				splits: row.splits.map((split) => ({ ...split, displayName: split.userId }))
			};
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
		async countByExpenseGroup(expenseGroupId) {
			return Array.from(rows.values()).filter((row) => row.expenseGroupId === expenseGroupId)
				.length;
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

function fakeExpenseGroupRepo(): IExpenseGroupRepository & {
	created: Array<ExpenseGroup>;
	deleted: Array<string>;
} {
	const created: Array<ExpenseGroup> = [];
	const deleted: Array<string> = [];
	let nextId = 0;
	return {
		created,
		deleted,
		async create(input: ExpenseGroupCreateInput) {
			const group: ExpenseGroup = {
				id: `expense-group-${nextId++}`,
				groupId: input.groupId,
				createdAt: new Date()
			};
			created.push(group);
			return group;
		},
		async getById(id) {
			return created.find((group) => group.id === id) ?? null;
		},
		async delete(id) {
			deleted.push(id);
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
			expenseGroupId: 'expense-group-0',
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
			uow: fakeUnitOfWork({
				expenseRepo,
				pairBalanceRepo: fakePairBalanceRepo(),
				expenseGroupRepo: fakeExpenseGroupRepo()
			}),
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
		const expenseGroupRepo = fakeExpenseGroupRepo();
		const service = createExpenseService({
			uow: fakeUnitOfWork({ expenseRepo, pairBalanceRepo, expenseGroupRepo }),
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
		expect(expenseGroupRepo.created).toHaveLength(1);
		expect(expenseGroupRepo.created[0].groupId).toBe(groupId);
		expect(created.expenseGroupId).toBe(expenseGroupRepo.created[0].id);
		expect(pairBalanceRepo.deltasApplied).toEqual([
			{ groupId, fromUserId: bob, toUserId: alice, amountCents: 500 }
		]);
	});

	it('notifies other group members but not the actor when an expense is created', async () => {
		const expenseRepo = fakeExpenseRepo();
		const notificationRepo = fakeNotificationRepo();
		const service = createExpenseService({
			uow: fakeUnitOfWork({
				expenseRepo,
				pairBalanceRepo: fakePairBalanceRepo(),
				expenseGroupRepo: fakeExpenseGroupRepo()
			}),
			expenseRepo,
			groupRepo: fakeGroupRepo('USD'),
			groupMemberRepo: fakeGroupMemberRepo([
				{ userId: alice, displayName: 'Alice', defaultSplitPercent: null, avatarStorageKey: null },
				{ userId: bob, displayName: 'Bob', defaultSplitPercent: null, avatarStorageKey: null }
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
			async remove() {},
			async getGroupIdsForUser() {
				return [];
			}
		};
		const service = createExpenseService({
			uow: fakeUnitOfWork({
				expenseRepo,
				pairBalanceRepo: fakePairBalanceRepo(),
				expenseGroupRepo: fakeExpenseGroupRepo()
			}),
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
				pairBalanceRepo: fakePairBalanceRepo(),
				expenseGroupRepo: fakeExpenseGroupRepo()
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

	describe('updateExpense with a former-member split', () => {
		const currentMembers: Array<GroupMemberWithUser> = [
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: null, avatarStorageKey: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null, avatarStorageKey: null }
		];

		function seedWithFormerMember(): ExpenseWithSplits {
			return {
				id: 'expense-0',
				groupId,
				expenseGroupId: 'expense-group-0',
				paidByUserId: alice,
				categoryId: null,
				description: 'Dinner',
				amountCents: 1000,
				date: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
				splits: [
					{
						id: 'split-a',
						expenseId: 'expense-0',
						userId: alice,
						amountCents: 400,
						createdAt: new Date()
					},
					{
						id: 'split-b',
						expenseId: 'expense-0',
						userId: bob,
						amountCents: 300,
						createdAt: new Date()
					},
					{
						id: 'split-c',
						expenseId: 'expense-0',
						userId: carol,
						amountCents: 300,
						createdAt: new Date()
					}
				]
			};
		}

		function serviceWithFormerMember(
			expenseRepo: IExpenseRepository,
			pairBalanceRepo: ReturnType<typeof fakePairBalanceRepo>
		) {
			return createExpenseService({
				uow: fakeUnitOfWork({
					expenseRepo,
					pairBalanceRepo,
					expenseGroupRepo: fakeExpenseGroupRepo()
				}),
				expenseRepo,
				groupRepo: fakeGroupRepo(),
				groupMemberRepo: fakeGroupMemberRepo(currentMembers),
				notificationRepo: fakeNotificationRepo()
			});
		}

		it('carries the former-member split through unchanged and keeps current-member splits editable', async () => {
			const expenseRepo = fakeExpenseRepo([seedWithFormerMember()]);
			const service = serviceWithFormerMember(expenseRepo, fakePairBalanceRepo());

			const updated = await service.updateExpense('expense-0', {
				paidByUserId: alice,
				categoryId: null,
				description: 'Dinner edited',
				amountCents: 1000,
				date: new Date(),
				splits: [
					{ userId: alice, amountCents: 500 },
					{ userId: bob, amountCents: 200 }
				]
			});

			expect(updated.splits).toContainEqual(
				expect.objectContaining({ userId: carol, amountCents: 300 })
			);
			expect(updated.splits).toContainEqual(
				expect.objectContaining({ userId: alice, amountCents: 500 })
			);
			expect(updated.splits).toContainEqual(
				expect.objectContaining({ userId: bob, amountCents: 200 })
			);
		});

		it('rejects a save whose current-member splits plus the frozen split do not sum to amountCents', async () => {
			const expenseRepo = fakeExpenseRepo([seedWithFormerMember()]);
			const service = serviceWithFormerMember(expenseRepo, fakePairBalanceRepo());

			await expect(
				service.updateExpense('expense-0', {
					paidByUserId: alice,
					categoryId: null,
					description: 'Dinner',
					amountCents: 1000,
					date: new Date(),
					splits: [
						{ userId: alice, amountCents: 500 },
						{ userId: bob, amountCents: 100 }
					]
				})
			).rejects.toBeInstanceOf(ExpenseSplitsDoNotSumError);
		});

		it('rejects an editable split that references a former member', async () => {
			const expenseRepo = fakeExpenseRepo([seedWithFormerMember()]);
			const service = serviceWithFormerMember(expenseRepo, fakePairBalanceRepo());

			await expect(
				service.updateExpense('expense-0', {
					paidByUserId: alice,
					categoryId: null,
					description: 'Dinner',
					amountCents: 1000,
					date: new Date(),
					splits: [
						{ userId: alice, amountCents: 400 },
						{ userId: bob, amountCents: 300 },
						{ userId: carol, amountCents: 300 }
					]
				})
			).rejects.toBeInstanceOf(FormerMemberSplitNotEditableError);
		});

		it('rejects changing who paid while a former-member split is frozen', async () => {
			const expenseRepo = fakeExpenseRepo([seedWithFormerMember()]);
			const service = serviceWithFormerMember(expenseRepo, fakePairBalanceRepo());

			await expect(
				service.updateExpense('expense-0', {
					paidByUserId: bob,
					categoryId: null,
					description: 'Dinner',
					amountCents: 1000,
					date: new Date(),
					splits: [
						{ userId: alice, amountCents: 500 },
						{ userId: bob, amountCents: 200 }
					]
				})
			).rejects.toBeInstanceOf(PaidByCannotChangeWithFormerMemberError);
		});

		it('does not create a pair-balance row involving the former member on save', async () => {
			const expenseRepo = fakeExpenseRepo([seedWithFormerMember()]);
			const pairBalanceRepo = fakePairBalanceRepo();
			const service = serviceWithFormerMember(expenseRepo, pairBalanceRepo);

			await service.updateExpense('expense-0', {
				paidByUserId: alice,
				categoryId: null,
				description: 'Dinner',
				amountCents: 1000,
				date: new Date(),
				splits: [
					{ userId: alice, amountCents: 500 },
					{ userId: bob, amountCents: 200 }
				]
			});

			expect(pairBalanceRepo.deltasApplied).not.toContainEqual(
				expect.objectContaining({ fromUserId: carol })
			);
			expect(pairBalanceRepo.deltasApplied).not.toContainEqual(
				expect.objectContaining({ toUserId: carol })
			);
		});

		describe('when the former member was the payer', () => {
			function seedWithFormerMemberPayer(): ExpenseWithSplits {
				return {
					id: 'expense-0',
					groupId,
					expenseGroupId: 'expense-group-0',
					paidByUserId: carol,
					categoryId: null,
					description: 'Dinner',
					amountCents: 1000,
					date: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
					splits: [
						{
							id: 'split-a',
							expenseId: 'expense-0',
							userId: alice,
							amountCents: 400,
							createdAt: new Date()
						},
						{
							id: 'split-b',
							expenseId: 'expense-0',
							userId: bob,
							amountCents: 600,
							createdAt: new Date()
						}
					]
				};
			}

			it('carries every split through unchanged on a metadata-only edit and creates no former-member balance row', async () => {
				const expenseRepo = fakeExpenseRepo([seedWithFormerMemberPayer()]);
				const pairBalanceRepo = fakePairBalanceRepo();
				const service = serviceWithFormerMember(expenseRepo, pairBalanceRepo);

				const updated = await service.updateExpense('expense-0', {
					paidByUserId: carol,
					categoryId: null,
					description: 'Dinner edited',
					amountCents: 1000,
					date: new Date(),
					splits: []
				});

				expect(updated.splits).toContainEqual(
					expect.objectContaining({ userId: alice, amountCents: 400 })
				);
				expect(updated.splits).toContainEqual(
					expect.objectContaining({ userId: bob, amountCents: 600 })
				);
				expect(pairBalanceRepo.deltasApplied).not.toContainEqual(
					expect.objectContaining({ fromUserId: carol })
				);
				expect(pairBalanceRepo.deltasApplied).not.toContainEqual(
					expect.objectContaining({ toUserId: carol })
				);
			});

			it('rejects a submitted editable split when the former member was the payer', async () => {
				const expenseRepo = fakeExpenseRepo([seedWithFormerMemberPayer()]);
				const service = serviceWithFormerMember(expenseRepo, fakePairBalanceRepo());

				await expect(
					service.updateExpense('expense-0', {
						paidByUserId: carol,
						categoryId: null,
						description: 'Dinner',
						amountCents: 1000,
						date: new Date(),
						splits: [{ userId: alice, amountCents: 400 }]
					})
				).rejects.toBeInstanceOf(FormerMemberSplitNotEditableError);
			});

			it('rejects an amount change when the former member was the payer', async () => {
				const expenseRepo = fakeExpenseRepo([seedWithFormerMemberPayer()]);
				const service = serviceWithFormerMember(expenseRepo, fakePairBalanceRepo());

				await expect(
					service.updateExpense('expense-0', {
						paidByUserId: carol,
						categoryId: null,
						description: 'Dinner',
						amountCents: 2000,
						date: new Date(),
						splits: []
					})
				).rejects.toBeInstanceOf(ExpenseSplitsDoNotSumError);
			});

			it('rejects reassigning the payer away from the former member', async () => {
				const expenseRepo = fakeExpenseRepo([seedWithFormerMemberPayer()]);
				const service = serviceWithFormerMember(expenseRepo, fakePairBalanceRepo());

				await expect(
					service.updateExpense('expense-0', {
						paidByUserId: alice,
						categoryId: null,
						description: 'Dinner',
						amountCents: 1000,
						date: new Date(),
						splits: []
					})
				).rejects.toBeInstanceOf(PaidByCannotChangeWithFormerMemberError);
			});
		});
	});

	it('reverses old deltas and applies new ones on delete', async () => {
		const seed: ExpenseWithSplits = {
			id: 'expense-0',
			groupId,
			expenseGroupId: 'expense-group-0',
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
		const expenseGroupRepo = fakeExpenseGroupRepo();
		const service = createExpenseService({
			uow: fakeUnitOfWork({ expenseRepo, pairBalanceRepo, expenseGroupRepo }),
			expenseRepo,
			groupRepo: fakeGroupRepo(),
			groupMemberRepo: fakeGroupMemberRepo([]),
			notificationRepo: fakeNotificationRepo()
		});

		await service.deleteExpense('expense-0');

		expect(expenseGroupRepo.deleted).toEqual(['expense-group-0']);
		expect(pairBalanceRepo.deltasApplied).toEqual([
			{ groupId, fromUserId: alice, toUserId: bob, amountCents: 500 }
		]);
	});
});
