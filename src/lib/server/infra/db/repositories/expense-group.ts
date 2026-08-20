import { eq } from 'drizzle-orm';
import type { IExpenseGroupRepository } from '$lib/server/app/interfaces/repositories/expense-group';
import type { Database } from '$lib/server/infra/db/types';
import { expenseGroup } from '$lib/server/infra/db/schema/expense-group';

const create =
	(db: Database): IExpenseGroupRepository['create'] =>
	async (input) => {
		const [row] = await db.insert(expenseGroup).values({ groupId: input.groupId }).returning();
		return row;
	};

const getById =
	(db: Database): IExpenseGroupRepository['getById'] =>
	async (id) => {
		const [row] = await db.select().from(expenseGroup).where(eq(expenseGroup.id, id));
		return row ?? null;
	};

const remove =
	(db: Database): IExpenseGroupRepository['delete'] =>
	async (id) => {
		await db.delete(expenseGroup).where(eq(expenseGroup.id, id));
	};

export function createExpenseGroupRepository(db: Database): IExpenseGroupRepository {
	return {
		create: create(db),
		getById: getById(db),
		delete: remove(db)
	};
}
