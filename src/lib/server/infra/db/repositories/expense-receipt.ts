import { asc, eq } from 'drizzle-orm';
import type { IExpenseReceiptRepository } from '$lib/server/app/interfaces/repositories/expense-receipt';
import type { Database } from '$lib/server/infra/db/types';
import { expenseReceipt } from '$lib/server/infra/db/schema/expense-receipt';

const create =
	(db: Database): IExpenseReceiptRepository['create'] =>
	async (input) => {
		const [row] = await db
			.insert(expenseReceipt)
			.values({
				expenseGroupId: input.expenseGroupId,
				storageKey: input.storageKey,
				mime: input.mime,
				sizeBytes: input.sizeBytes,
				originalFilename: input.originalFilename,
				uploadedByUserId: input.uploadedByUserId
			})
			.returning();
		return row;
	};

const getById =
	(db: Database): IExpenseReceiptRepository['getById'] =>
	async (id) => {
		const [row] = await db.select().from(expenseReceipt).where(eq(expenseReceipt.id, id));
		return row ?? null;
	};

const getAllForExpenseGroup =
	(db: Database): IExpenseReceiptRepository['getAllForExpenseGroup'] =>
	async (expenseGroupId) => {
		return await db
			.select()
			.from(expenseReceipt)
			.where(eq(expenseReceipt.expenseGroupId, expenseGroupId))
			.orderBy(asc(expenseReceipt.uploadedAt));
	};

const remove =
	(db: Database): IExpenseReceiptRepository['delete'] =>
	async (id) => {
		await db.delete(expenseReceipt).where(eq(expenseReceipt.id, id));
	};

export function createExpenseReceiptRepository(db: Database): IExpenseReceiptRepository {
	return {
		create: create(db),
		getById: getById(db),
		getAllForExpenseGroup: getAllForExpenseGroup(db),
		delete: remove(db)
	};
}
