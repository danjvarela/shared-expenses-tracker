import type { IExpenseRepository } from '$lib/server/app/interfaces/repositories/expense';
import type { Database } from '$lib/server/infra/db/types';
import { expense } from '$lib/server/infra/db/schema/expense';
import { expenseSplit } from '$lib/server/infra/db/schema/expense-split';
import { user } from '$lib/server/infra/db/schema/user';
import { category } from '$lib/server/infra/db/schema/category';
import { count, eq } from 'drizzle-orm';

const create =
	(db: Database): IExpenseRepository['create'] =>
	async (input) => {
		const [expenseRow] = await db
			.insert(expense)
			.values({
				groupId: input.groupId,
				expenseGroupId: input.expenseGroupId,
				paidByUserId: input.paidByUserId,
				categoryId: input.categoryId,
				description: input.description,
				amountCents: input.amountCents,
				date: input.date
			})
			.returning();

		const splits = await db
			.insert(expenseSplit)
			.values(input.splits.map((split) => ({ expenseId: expenseRow.id, ...split })))
			.returning();

		return { ...expenseRow, splits };
	};

const getWithSplits =
	(db: Database): IExpenseRepository['getWithSplits'] =>
	async (id) => {
		const [expenseRow] = await db
			.select({
				id: expense.id,
				groupId: expense.groupId,
				expenseGroupId: expense.expenseGroupId,
				paidByUserId: expense.paidByUserId,
				categoryId: expense.categoryId,
				description: expense.description,
				amountCents: expense.amountCents,
				date: expense.date,
				createdAt: expense.createdAt,
				updatedAt: expense.updatedAt,
				paidByName: user.displayName
			})
			.from(expense)
			.innerJoin(user, eq(user.id, expense.paidByUserId))
			.where(eq(expense.id, id));
		if (!expenseRow) return null;

		const splits = await db
			.select({
				id: expenseSplit.id,
				expenseId: expenseSplit.expenseId,
				userId: expenseSplit.userId,
				amountCents: expenseSplit.amountCents,
				createdAt: expenseSplit.createdAt,
				displayName: user.displayName
			})
			.from(expenseSplit)
			.innerJoin(user, eq(user.id, expenseSplit.userId))
			.where(eq(expenseSplit.expenseId, id));
		return {
			...expenseRow,
			paidByName: expenseRow.paidByName ?? 'Unknown',
			splits: splits.map((split) => ({ ...split, displayName: split.displayName ?? 'Unknown' }))
		};
	};

const update =
	(db: Database): IExpenseRepository['update'] =>
	async (id, input) => {
		const [expenseRow] = await db
			.update(expense)
			.set({
				paidByUserId: input.paidByUserId,
				categoryId: input.categoryId,
				description: input.description,
				amountCents: input.amountCents,
				date: input.date,
				updatedAt: new Date()
			})
			.where(eq(expense.id, id))
			.returning();

		await db.delete(expenseSplit).where(eq(expenseSplit.expenseId, id));

		const splits = await db
			.insert(expenseSplit)
			.values(input.splits.map((split) => ({ expenseId: id, ...split })))
			.returning();

		return { ...expenseRow, splits };
	};

const deleteExpense =
	(db: Database): IExpenseRepository['delete'] =>
	async (id) => {
		await db.delete(expense).where(eq(expense.id, id));
	};

const countByExpenseGroup =
	(db: Database): IExpenseRepository['countByExpenseGroup'] =>
	async (expenseGroupId) => {
		const [row] = await db
			.select({ total: count() })
			.from(expense)
			.where(eq(expense.expenseGroupId, expenseGroupId));
		return row?.total ?? 0;
	};

const getAllForGroupWithSplits =
	(db: Database): IExpenseRepository['getAllForGroupWithSplits'] =>
	async (groupId) => {
		const expenseRows = await db.select().from(expense).where(eq(expense.groupId, groupId));

		return Promise.all(
			expenseRows.map(async (expenseRow) => {
				const splits = await db
					.select()
					.from(expenseSplit)
					.where(eq(expenseSplit.expenseId, expenseRow.id));
				return { ...expenseRow, splits };
			})
		);
	};

const getAllForGroupWithDetails =
	(db: Database): IExpenseRepository['getAllForGroupWithDetails'] =>
	async (groupId) => {
		const expenseRows = await db
			.select({
				id: expense.id,
				groupId: expense.groupId,
				expenseGroupId: expense.expenseGroupId,
				paidByUserId: expense.paidByUserId,
				categoryId: expense.categoryId,
				description: expense.description,
				amountCents: expense.amountCents,
				date: expense.date,
				createdAt: expense.createdAt,
				updatedAt: expense.updatedAt,
				paidByName: user.displayName,
				categoryName: category.name,
				categoryIcon: category.icon
			})
			.from(expense)
			.innerJoin(user, eq(user.id, expense.paidByUserId))
			.leftJoin(category, eq(category.id, expense.categoryId))
			.where(eq(expense.groupId, groupId));

		return Promise.all(
			expenseRows.map(async (expenseRow) => {
				const splits = await db
					.select()
					.from(expenseSplit)
					.where(eq(expenseSplit.expenseId, expenseRow.id));
				return { ...expenseRow, splits };
			})
		);
	};

const getAllForExpenseGroupWithDetails =
	(db: Database): IExpenseRepository['getAllForExpenseGroupWithDetails'] =>
	async (expenseGroupId) => {
		const expenseRows = await db
			.select({
				id: expense.id,
				groupId: expense.groupId,
				expenseGroupId: expense.expenseGroupId,
				paidByUserId: expense.paidByUserId,
				categoryId: expense.categoryId,
				description: expense.description,
				amountCents: expense.amountCents,
				date: expense.date,
				createdAt: expense.createdAt,
				updatedAt: expense.updatedAt,
				paidByName: user.displayName,
				categoryName: category.name,
				categoryIcon: category.icon
			})
			.from(expense)
			.innerJoin(user, eq(user.id, expense.paidByUserId))
			.leftJoin(category, eq(category.id, expense.categoryId))
			.where(eq(expense.expenseGroupId, expenseGroupId));

		return Promise.all(
			expenseRows.map(async (expenseRow) => {
				const splits = await db
					.select()
					.from(expenseSplit)
					.where(eq(expenseSplit.expenseId, expenseRow.id));
				return { ...expenseRow, splits };
			})
		);
	};

export function createExpenseRepository(db: Database): IExpenseRepository {
	return {
		create: create(db),
		getWithSplits: getWithSplits(db),
		update: update(db),
		delete: deleteExpense(db),
		countByExpenseGroup: countByExpenseGroup(db),
		getAllForGroupWithSplits: getAllForGroupWithSplits(db),
		getAllForGroupWithDetails: getAllForGroupWithDetails(db),
		getAllForExpenseGroupWithDetails: getAllForExpenseGroupWithDetails(db)
	};
}
