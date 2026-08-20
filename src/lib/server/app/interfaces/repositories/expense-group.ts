import type { ExpenseGroup } from '$lib/server/domain/expense-group';

export interface ExpenseGroupCreateInput {
	groupId: string;
}

export interface IExpenseGroupRepository {
	create(input: ExpenseGroupCreateInput): Promise<ExpenseGroup>;
	getById(id: string): Promise<ExpenseGroup | null>;
	delete(id: string): Promise<void>;
}
