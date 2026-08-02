import type { Expense } from '$lib/server/domain/expense';
import type { ExpenseSplit } from '$lib/server/domain/expense-split';

export interface ExpenseWithSplits extends Expense {
	splits: Array<ExpenseSplit>;
}

export interface ExpenseWithDetails extends ExpenseWithSplits {
	paidByName: string;
	categoryName: string | null;
	categoryIcon: string | null;
}

export interface IExpenseRepository {
	create(input: {
		groupId: string;
		paidByUserId: string;
		categoryId: string | null;
		description: string;
		amountCents: number;
		splits: Array<{ userId: string; amountCents: number }>;
	}): Promise<ExpenseWithSplits>;

	getWithSplits(id: string): Promise<ExpenseWithSplits | null>;

	update(
		id: string,
		input: {
			paidByUserId: string;
			categoryId: string | null;
			description: string;
			amountCents: number;
			splits: Array<{ userId: string; amountCents: number }>;
		}
	): Promise<ExpenseWithSplits>;

	delete(id: string): Promise<void>;

	getAllForGroupWithSplits(groupId: string): Promise<Array<ExpenseWithSplits>>;

	getAllForGroupWithDetails(groupId: string): Promise<Array<ExpenseWithDetails>>;
}
