import { AppError } from '$lib/server/app/error';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type {
	IExpenseRepository,
	ExpenseWithSplits,
	ExpenseWithDetails
} from '$lib/server/app/interfaces/repositories/expense';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type { INotificationRepository } from '$lib/server/app/interfaces/repositories/notification';
import { applyPairBalanceDeltas, expenseDeltas } from '$lib/server/app/pair-balance';
import { formatAmountCents } from '$lib/currency';

export interface ExpenseInput {
	groupId: string;
	paidByUserId: string;
	categoryId: string | null;
	description: string;
	amountCents: number;
	date: Date;
	splits: Array<{ userId: string; amountCents: number }>;
}

export interface ExpenseRepos {
	expenseRepo: IExpenseRepository;
	pairBalanceRepo: IPairBalanceRepository;
}

export class ExpenseNotFoundError extends AppError {
	constructor() {
		super('Expense not found', 404);
	}
}

export function createExpenseService(deps: {
	uow: IUnitOfWork<ExpenseRepos>;
	expenseRepo: IExpenseRepository;
	groupRepo: IGroupRepository;
	groupMemberRepo: IGroupMemberRepository;
	notificationRepo: INotificationRepository;
}) {
	async function getGroupExpenses(groupId: string): Promise<Array<ExpenseWithDetails>> {
		return await deps.expenseRepo.getAllForGroupWithDetails(groupId);
	}

	async function notifyExpenseCreated(actorUserId: string, expense: ExpenseWithSplits) {
		try {
			const [group, members] = await Promise.all([
				deps.groupRepo.getById(expense.groupId),
				deps.groupMemberRepo.getAllForGroupWithUser(expense.groupId)
			]);
			if (!group) return;

			const actor = members.find((member) => member.userId === actorUserId);
			const actorName = actor?.displayName ?? 'Someone';
			const amount = formatAmountCents(expense.amountCents, group.currencyCode);
			const message = `${actorName} added ${expense.description} (${amount})`;

			await Promise.all(
				members
					.filter((member) => member.userId !== actorUserId)
					.map((member) =>
						deps.notificationRepo.create({
							userId: member.userId,
							groupId: expense.groupId,
							type: 'expense_created',
							expenseId: expense.id,
							settlementId: null,
							message
						})
					)
			);
		} catch (err) {
			console.error('Failed to create expense-created notifications', err);
		}
	}

	async function createExpense(
		input: ExpenseInput,
		actorUserId: string
	): Promise<ExpenseWithSplits> {
		const created = await deps.uow.run(async ({ expenseRepo, pairBalanceRepo }) => {
			const created = await expenseRepo.create(input);

			await applyPairBalanceDeltas(
				pairBalanceRepo,
				input.groupId,
				expenseDeltas(input.paidByUserId, input.splits)
			);

			return created;
		});

		await notifyExpenseCreated(actorUserId, created);

		return created;
	}

	async function updateExpense(
		id: string,
		input: Omit<ExpenseInput, 'groupId'>
	): Promise<ExpenseWithSplits> {
		return deps.uow.run(async ({ expenseRepo, pairBalanceRepo }) => {
			const existing = await expenseRepo.getWithSplits(id);
			if (!existing) throw new ExpenseNotFoundError();

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
			if (!existing) throw new ExpenseNotFoundError();

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
