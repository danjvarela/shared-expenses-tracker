import { describe, it, expect, vi, afterEach } from 'vitest';
import type {
	IExpenseRepository,
	ExpenseWithSplits
} from '$lib/server/app/interfaces/repositories/expense';
import type { ICategoryRepository } from '$lib/server/app/interfaces/repositories/category';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type { Category } from '$lib/server/domain/category';
import type { Group } from '$lib/server/domain/group';
import { createDashboardService } from './dashboard';

const alice = 'alice';
const groupId = 'group-1';

function fakeExpenseRepo(byGroup: Record<string, Array<ExpenseWithSplits>>): IExpenseRepository {
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
			return byGroup[groupId] ?? [];
		}
	};
}

function fakeCategoryRepo(categories: Array<Category>): ICategoryRepository {
	return {
		async getAll() {
			return categories;
		},
		async getDefaults() {
			return categories.filter((c) => c.ownerGroupId === null);
		},
		async getAllForGroup() {
			return categories;
		},
		async findById(categoryId) {
			return categories.find((c) => c.id === categoryId) ?? null;
		},
		async findByOwnerAndName() {
			return null;
		},
		async create() {
			throw new Error('not implemented');
		},
		async update() {
			throw new Error('not implemented');
		},
		async addToGroup() {},
		async removeFromGroup() {},
		async delete() {}
	};
}

function fakeGroupRepo(groups: Array<Group>): IGroupRepository {
	return {
		async getAll() {
			return groups;
		},
		async getById(id) {
			return groups.find((g) => g.id === id) ?? null;
		},
		async create() {
			throw new Error('not implemented');
		},
		async update() {
			throw new Error('not implemented');
		},
		async delete() {
			throw new Error('not implemented');
		}
	};
}

function makeExpense(overrides: Partial<ExpenseWithSplits> & { id: string }): ExpenseWithSplits {
	return {
		groupId,
		expenseGroupId: 'expense-group-1',
		paidByUserId: alice,
		categoryId: null,
		description: 'Expense',
		amountCents: 1000,
		date: new Date('2026-09-15'),
		createdAt: new Date(),
		updatedAt: new Date(),
		splits: [],
		...overrides
	};
}

function makeCategory(overrides: Partial<Category> & { id: string; name: string }): Category {
	return {
		icon: '🍔',
		ownerGroupId: null,
		createdAt: new Date(),
		...overrides
	};
}

function makeGroup(overrides: Partial<Group> & { id: string; name: string }): Group {
	return {
		currencyCode: 'USD',
		avatarIcon: null,
		createdAt: new Date(),
		...overrides
	};
}

describe('createDashboardService', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	describe('getGroupDashboard', () => {
		it('sums current-month total from expenses in the current calendar month', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-09-23'));

			const service = createDashboardService({
				expenseRepo: fakeExpenseRepo({
					[groupId]: [
						makeExpense({ id: 'e1', date: new Date('2026-09-10'), amountCents: 1000 }),
						makeExpense({ id: 'e2', date: new Date('2026-09-20'), amountCents: 500 }),
						makeExpense({ id: 'e3', date: new Date('2026-08-01'), amountCents: 9999 })
					]
				}),
				categoryRepo: fakeCategoryRepo([]),
				groupRepo: fakeGroupRepo([])
			});

			const dashboard = await service.getGroupDashboard(groupId);

			expect(dashboard.currentMonthTotalCents).toBe(1500);
		});

		it('returns zero current-month total when there are no current-month expenses', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-09-23'));

			const service = createDashboardService({
				expenseRepo: fakeExpenseRepo({
					[groupId]: [makeExpense({ id: 'e1', date: new Date('2026-08-01'), amountCents: 9999 })]
				}),
				categoryRepo: fakeCategoryRepo([]),
				groupRepo: fakeGroupRepo([])
			});

			const dashboard = await service.getGroupDashboard(groupId);

			expect(dashboard.currentMonthTotalCents).toBe(0);
		});

		it('breaks down a picked past month by category, including an Uncategorized bucket', async () => {
			const food = makeCategory({ id: 'cat-food', name: 'Food' });
			const service = createDashboardService({
				expenseRepo: fakeExpenseRepo({
					[groupId]: [
						makeExpense({
							id: 'e1',
							date: new Date('2026-06-05'),
							amountCents: 1000,
							categoryId: 'cat-food'
						}),
						makeExpense({
							id: 'e2',
							date: new Date('2026-06-10'),
							amountCents: 300,
							categoryId: 'cat-food'
						}),
						makeExpense({ id: 'e3', date: new Date('2026-06-15'), amountCents: 700, categoryId: null }),
						makeExpense({ id: 'e4', date: new Date('2026-07-01'), amountCents: 5000, categoryId: null })
					]
				}),
				categoryRepo: fakeCategoryRepo([food]),
				groupRepo: fakeGroupRepo([])
			});

			const dashboard = await service.getGroupDashboard(groupId, '2026-06');

			expect(dashboard.categoryBreakdown).toEqual([
				{ categoryId: 'cat-food', name: 'Food', icon: '🍔', amountCents: 1300 },
				{ categoryId: null, name: 'Uncategorized', icon: null, amountCents: 700 }
			]);
		});

		it('looks up a category no longer attached to the group by id instead of relabeling it Uncategorized', async () => {
			const detachedFood = makeCategory({ id: 'cat-food', name: 'Food' });
			const categoryRepo = fakeCategoryRepo([]);
			categoryRepo.findById = async (categoryId: string) =>
				categoryId === detachedFood.id ? detachedFood : null;

			const service = createDashboardService({
				expenseRepo: fakeExpenseRepo({
					[groupId]: [
						makeExpense({
							id: 'e1',
							date: new Date('2026-06-05'),
							amountCents: 1000,
							categoryId: detachedFood.id
						})
					]
				}),
				categoryRepo,
				groupRepo: fakeGroupRepo([])
			});

			const dashboard = await service.getGroupDashboard(groupId, '2026-06');

			expect(dashboard.categoryBreakdown).toEqual([
				{ categoryId: 'cat-food', name: 'Food', icon: '🍔', amountCents: 1000 }
			]);
		});

		it('derives the month list only from months that have expenses', async () => {
			const service = createDashboardService({
				expenseRepo: fakeExpenseRepo({
					[groupId]: [
						makeExpense({ id: 'e1', date: new Date('2026-06-05') }),
						makeExpense({ id: 'e2', date: new Date('2026-06-10') }),
						makeExpense({ id: 'e3', date: new Date('2026-08-01') })
					]
				}),
				categoryRepo: fakeCategoryRepo([]),
				groupRepo: fakeGroupRepo([])
			});

			const dashboard = await service.getGroupDashboard(groupId);

			expect(dashboard.months).toEqual(['2026-08', '2026-06']);
		});

		it('averages per month and per day over a single-month partial period', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-09-11'));

			const service = createDashboardService({
				expenseRepo: fakeExpenseRepo({
					[groupId]: [makeExpense({ id: 'e1', date: new Date('2026-09-01'), amountCents: 1100 })]
				}),
				categoryRepo: fakeCategoryRepo([]),
				groupRepo: fakeGroupRepo([])
			});

			const dashboard = await service.getGroupDashboard(groupId);

			expect(dashboard.averagePerMonthCents).toBe(1100);
			expect(dashboard.averagePerDayCents).toBe(100);
		});

		it('averages per month and per day across a multi-month, multi-year history', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-01-01'));

			const service = createDashboardService({
				expenseRepo: fakeExpenseRepo({
					[groupId]: [
						makeExpense({ id: 'e1', date: new Date('2025-01-01'), amountCents: 6000 }),
						makeExpense({ id: 'e2', date: new Date('2025-06-01'), amountCents: 6000 })
					]
				}),
				categoryRepo: fakeCategoryRepo([]),
				groupRepo: fakeGroupRepo([])
			});

			const dashboard = await service.getGroupDashboard(groupId);

			expect(dashboard.averagePerMonthCents).toBe(Math.round(12000 / 13));
			expect(dashboard.averagePerDayCents).toBe(Math.round(12000 / 366));
		});

		it('returns an empty-state shape for a group with zero expenses', async () => {
			const service = createDashboardService({
				expenseRepo: fakeExpenseRepo({}),
				categoryRepo: fakeCategoryRepo([]),
				groupRepo: fakeGroupRepo([])
			});

			const dashboard = await service.getGroupDashboard(groupId);

			expect(dashboard).toEqual({
				currentMonthTotalCents: 0,
				months: [],
				categoryBreakdown: [],
				averagePerMonthCents: 0,
				averagePerDayCents: 0
			});
		});
	});

	describe('getHomepageDashboard', () => {
		const groupA = makeGroup({ id: 'group-a', name: 'Trip', currencyCode: 'USD' });
		const groupB = makeGroup({ id: 'group-b', name: 'Rent', currencyCode: 'EUR' });

		it('aggregates across groups with different currencies without summing per-group amounts', async () => {
			const service = createDashboardService({
				expenseRepo: fakeExpenseRepo({
					[groupA.id]: [
						makeExpense({
							id: 'e1',
							groupId: groupA.id,
							date: new Date('2026-06-05'),
							amountCents: 1000,
							splits: [{ id: 's1', expenseId: 'e1', userId: alice, amountCents: 500, createdAt: new Date() }]
						})
					],
					[groupB.id]: [
						makeExpense({
							id: 'e2',
							groupId: groupB.id,
							date: new Date('2026-06-06'),
							amountCents: 2000,
							splits: [{ id: 's2', expenseId: 'e2', userId: alice, amountCents: 300, createdAt: new Date() }]
						})
					]
				}),
				categoryRepo: fakeCategoryRepo([]),
				groupRepo: fakeGroupRepo([groupA, groupB])
			});

			const dashboard = await service.getHomepageDashboard(alice, '2026-06');

			expect(dashboard.groupBreakdown).toEqual([
				{ groupId: groupA.id, groupName: 'Trip', currencyCode: 'USD', amountCents: 500 },
				{ groupId: groupB.id, groupName: 'Rent', currencyCode: 'EUR', amountCents: 300 }
			]);
		});

		it('sums split shares regardless of currency for the current-month total', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-09-23'));

			const service = createDashboardService({
				expenseRepo: fakeExpenseRepo({
					[groupA.id]: [
						makeExpense({
							id: 'e1',
							groupId: groupA.id,
							date: new Date('2026-09-05'),
							amountCents: 1000,
							splits: [{ id: 's1', expenseId: 'e1', userId: alice, amountCents: 500, createdAt: new Date() }]
						})
					],
					[groupB.id]: [
						makeExpense({
							id: 'e2',
							groupId: groupB.id,
							date: new Date('2026-09-06'),
							amountCents: 2000,
							splits: [{ id: 's2', expenseId: 'e2', userId: alice, amountCents: 300, createdAt: new Date() }]
						})
					]
				}),
				categoryRepo: fakeCategoryRepo([]),
				groupRepo: fakeGroupRepo([groupA, groupB])
			});

			const dashboard = await service.getHomepageDashboard(alice);

			expect(dashboard.currentMonthTotalCents).toBe(800);
		});

		it('returns an empty-state shape for a user with zero expenses anywhere', async () => {
			const service = createDashboardService({
				expenseRepo: fakeExpenseRepo({}),
				categoryRepo: fakeCategoryRepo([]),
				groupRepo: fakeGroupRepo([groupA])
			});

			const dashboard = await service.getHomepageDashboard(alice);

			expect(dashboard).toEqual({
				currentMonthTotalCents: 0,
				months: [],
				groupBreakdown: [],
				averagePerMonthCents: 0,
				averagePerDayCents: 0
			});
		});
	});
});
