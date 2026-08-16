import type { Expense } from '$lib/server/domain/expense';
import type { ExpenseSplit } from '$lib/server/domain/expense-split';

export interface ExpenseSplitWithName extends ExpenseSplit {
	displayName: string;
}

export interface ExpenseWithSplits extends Expense {
	splits: Array<ExpenseSplit>;
}

export interface ExpenseWithSplitsAndNames extends Expense {
	splits: Array<ExpenseSplitWithName>;
	paidByName: string;
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
		date: Date;
		splits: Array<{ userId: string; amountCents: number }>;
	}): Promise<ExpenseWithSplits>;

	getWithSplits(id: string): Promise<ExpenseWithSplitsAndNames | null>;

	update(
		id: string,
		input: {
			paidByUserId: string;
			categoryId: string | null;
			description: string;
			amountCents: number;
			date: Date;
			splits: Array<{ userId: string; amountCents: number }>;
		}
	): Promise<ExpenseWithSplits>;

	delete(id: string): Promise<void>;

	getAllForGroupWithSplits(groupId: string): Promise<Array<ExpenseWithSplits>>;

	getAllForGroupWithDetails(groupId: string): Promise<Array<ExpenseWithDetails>>;
}
