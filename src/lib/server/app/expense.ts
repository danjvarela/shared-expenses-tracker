import { db } from '$lib/server/infra/db';
import { createExpenseRepository } from '$lib/server/infra/db/repositories/expense';
import { createPairBalanceRepository } from '$lib/server/infra/db/repositories/pair-balance';
import { applyPairBalanceDeltas, expenseDeltas } from '$lib/server/app/pair-balance';
import type { ExpenseWithSplits } from '$lib/server/app/interfaces/repositories/expense';

export interface ExpenseInput {
	groupId: string;
	paidByUserId: string;
	categoryId: string | null;
	description: string;
	amountCents: number;
	splits: Array<{ userId: string; amountCents: number }>;
}

export async function createExpense(input: ExpenseInput): Promise<ExpenseWithSplits> {
	return db.transaction(async (tx) => {
		const expenseRepo = createExpenseRepository(tx);
		const pairBalanceRepo = createPairBalanceRepository(tx);

		const created = await expenseRepo.create(input);

		await applyPairBalanceDeltas(
			pairBalanceRepo,
			input.groupId,
			expenseDeltas(input.paidByUserId, input.splits)
		);

		return created;
	});
}

export async function updateExpense(
	id: string,
	input: Omit<ExpenseInput, 'groupId'>
): Promise<ExpenseWithSplits> {
	return db.transaction(async (tx) => {
		const expenseRepo = createExpenseRepository(tx);
		const pairBalanceRepo = createPairBalanceRepository(tx);

		const existing = await expenseRepo.getWithSplits(id);
		if (!existing) throw new Error(`Expense not found: ${id}`);

		const updated = await expenseRepo.update(id, input);

		const reversedOldDeltas = expenseDeltas(existing.paidByUserId, existing.splits).map(
			(delta) => ({ ...delta, deltaAToB: -delta.deltaAToB })
		);
		const newDeltas = expenseDeltas(input.paidByUserId, input.splits);

		await applyPairBalanceDeltas(pairBalanceRepo, existing.groupId, [
			...reversedOldDeltas,
			...newDeltas
		]);

		return updated;
	});
}

export async function deleteExpense(id: string): Promise<void> {
	return db.transaction(async (tx) => {
		const expenseRepo = createExpenseRepository(tx);
		const pairBalanceRepo = createPairBalanceRepository(tx);

		const existing = await expenseRepo.getWithSplits(id);
		if (!existing) throw new Error(`Expense not found: ${id}`);

		await expenseRepo.delete(id);

		const reversedDeltas = expenseDeltas(existing.paidByUserId, existing.splits).map((delta) => ({
			...delta,
			deltaAToB: -delta.deltaAToB
		}));

		await applyPairBalanceDeltas(pairBalanceRepo, existing.groupId, reversedDeltas);
	});
}
