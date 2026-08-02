import type { IExpenseRepository } from '$lib/server/app/interfaces/repositories/expense';
import type { Database } from '$lib/server/infra/db/types';
import { expense } from '$lib/server/infra/db/schema/expense';
import { expenseSplit } from '$lib/server/infra/db/schema/expense-split';
import { eq } from 'drizzle-orm';

const create =
	(db: Database): IExpenseRepository['create'] =>
	async (input) => {
		const [expenseRow] = await db
			.insert(expense)
			.values({
				groupId: input.groupId,
				paidByUserId: input.paidByUserId,
				categoryId: input.categoryId,
				description: input.description,
				amountCents: input.amountCents
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
		const [expenseRow] = await db.select().from(expense).where(eq(expense.id, id));
		if (!expenseRow) return null;

		const splits = await db.select().from(expenseSplit).where(eq(expenseSplit.expenseId, id));
		return { ...expenseRow, splits };
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

export function createExpenseRepository(db: Database): IExpenseRepository {
	return {
		create: create(db),
		getWithSplits: getWithSplits(db),
		update: update(db),
		delete: deleteExpense(db),
		getAllForGroupWithSplits: getAllForGroupWithSplits(db)
	};
}
