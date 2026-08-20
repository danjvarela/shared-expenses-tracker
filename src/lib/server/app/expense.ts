import { AppError } from '$lib/server/app/error';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type {
	IExpenseRepository,
	ExpenseWithSplits,
	ExpenseWithDetails
} from '$lib/server/app/interfaces/repositories/expense';
import type { IExpenseGroupRepository } from '$lib/server/app/interfaces/repositories/expense-group';
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
	expenseGroupRepo: IExpenseGroupRepository;
}

export class ExpenseNotFoundError extends AppError {
	constructor() {
		super('Expense not found', 404);
	}
}

export class ExpenseGroupNotFoundError extends AppError {
	constructor() {
		super('Expense group not found', 404);
	}
}

export class FormerMemberSplitNotEditableError extends AppError {
	constructor() {
		super('Cannot edit a split for a former member of the group');
	}
}

export class ExpenseSplitsDoNotSumError extends AppError {
	constructor() {
		super('Split amounts do not add up to the total');
	}
}

export class PaidByCannotChangeWithFormerMemberError extends AppError {
	constructor() {
		super('Cannot change who paid while the expense involves a former member');
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
		const created = await deps.uow.run(
			async ({ expenseRepo, pairBalanceRepo, expenseGroupRepo }) => {
				const expenseGroup = await expenseGroupRepo.create({ groupId: input.groupId });
				const created = await expenseRepo.create({ ...input, expenseGroupId: expenseGroup.id });

				await applyPairBalanceDeltas(
					pairBalanceRepo,
					input.groupId,
					expenseDeltas(input.paidByUserId, input.splits)
				);

				return created;
			}
		);

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

			const members = await deps.groupMemberRepo.getAllForGroupWithUser(existing.groupId);
			const currentMemberIds = new Set(members.map((member) => member.userId));
			const paidByIsFormerMember = !currentMemberIds.has(existing.paidByUserId);

			let editableSplits: Array<{ userId: string; amountCents: number }>;
			let frozenSplits: Array<{ userId: string; amountCents: number }>;

			if (paidByIsFormerMember) {
				if (input.splits.length > 0) {
					throw new FormerMemberSplitNotEditableError();
				}
				editableSplits = [];
				frozenSplits = existing.splits.map((split) => ({
					userId: split.userId,
					amountCents: split.amountCents
				}));
			} else {
				for (const split of input.splits) {
					if (!currentMemberIds.has(split.userId)) {
						throw new FormerMemberSplitNotEditableError();
					}
				}
				editableSplits = input.splits;
				frozenSplits = existing.splits
					.filter((split) => !currentMemberIds.has(split.userId))
					.map((split) => ({ userId: split.userId, amountCents: split.amountCents }));
			}

			if (frozenSplits.length > 0 && input.paidByUserId !== existing.paidByUserId) {
				throw new PaidByCannotChangeWithFormerMemberError();
			}

			const finalSplits = [...editableSplits, ...frozenSplits];
			const sum = finalSplits.reduce((total, split) => total + split.amountCents, 0);
			if (sum !== input.amountCents) {
				throw new ExpenseSplitsDoNotSumError();
			}

			const updated = await expenseRepo.update(id, { ...input, splits: finalSplits });

			const reversedOldDeltas = expenseDeltas(existing.paidByUserId, existing.splits).map(
				(delta) => ({ ...delta, deltaAToB: -delta.deltaAToB })
			);
			const newDeltas = expenseDeltas(input.paidByUserId, finalSplits);

			await applyPairBalanceDeltas(pairBalanceRepo, existing.groupId, [
				...reversedOldDeltas,
				...newDeltas
			]);

			return updated;
		});
	}

	async function deleteExpense(id: string): Promise<void> {
		return deps.uow.run(async ({ expenseRepo, pairBalanceRepo, expenseGroupRepo }) => {
			const existing = await expenseRepo.getWithSplits(id);
			if (!existing) throw new ExpenseNotFoundError();

			await expenseRepo.delete(id);

			const remaining = await expenseRepo.countByExpenseGroup(existing.expenseGroupId);
			if (remaining === 0) {
				await expenseGroupRepo.delete(existing.expenseGroupId);
			}

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
