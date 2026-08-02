import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type {
	IExpenseRepository,
	ExpenseWithSplits,
	ExpenseWithDetails
} from '$lib/server/app/interfaces/repositories/expense';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import { applyPairBalanceDeltas, expenseDeltas } from '$lib/server/app/pair-balance';

export interface ExpenseInput {
	groupId: string;
	paidByUserId: string;
	categoryId: string | null;
	description: string;
	amountCents: number;
	splits: Array<{ userId: string; amountCents: number }>;
}

export interface ExpenseRepos {
	expenseRepo: IExpenseRepository;
	pairBalanceRepo: IPairBalanceRepository;
}

export function createExpenseService(deps: {
	uow: IUnitOfWork<ExpenseRepos>;
	expenseRepo: IExpenseRepository;
}) {
	async function getGroupExpenses(groupId: string): Promise<Array<ExpenseWithDetails>> {
		return await deps.expenseRepo.getAllForGroupWithDetails(groupId);
	}

	async function createExpense(input: ExpenseInput): Promise<ExpenseWithSplits> {
		return deps.uow.run(async ({ expenseRepo, pairBalanceRepo }) => {
			const created = await expenseRepo.create(input);

			await applyPairBalanceDeltas(
				pairBalanceRepo,
				input.groupId,
				expenseDeltas(input.paidByUserId, input.splits)
			);

			return created;
		});
	}

	async function updateExpense(
		id: string,
		input: Omit<ExpenseInput, 'groupId'>
	): Promise<ExpenseWithSplits> {
		return deps.uow.run(async ({ expenseRepo, pairBalanceRepo }) => {
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

	async function deleteExpense(id: string): Promise<void> {
		return deps.uow.run(async ({ expenseRepo, pairBalanceRepo }) => {
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

	return { getGroupExpenses, createExpense, updateExpense, deleteExpense };
}

export type ExpenseService = ReturnType<typeof createExpenseService>;
