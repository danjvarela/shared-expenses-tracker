import type { ExpenseGroup } from '$lib/server/domain/expense-group';

export interface ExpenseGroupCreateInput {
	groupId: string;
	name?: string | null;
}

export interface IExpenseGroupRepository {
	create(input: ExpenseGroupCreateInput): Promise<ExpenseGroup>;
	getById(id: string): Promise<ExpenseGroup | null>;
	update(id: string, input: { name: string | null }): Promise<ExpenseGroup>;
	delete(id: string): Promise<void>;
}
