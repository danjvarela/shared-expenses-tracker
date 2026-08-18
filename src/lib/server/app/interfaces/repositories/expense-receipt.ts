import type { ExpenseReceipt } from '$lib/server/domain/expense-receipt';

export interface ExpenseReceiptCreateInput {
	expenseId: string;
	storageKey: string;
	mime: string;
	sizeBytes: number;
	originalFilename: string | null;
	uploadedByUserId: string;
}

export interface IExpenseReceiptRepository {
	create(input: ExpenseReceiptCreateInput): Promise<ExpenseReceipt>;
	getById(id: string): Promise<ExpenseReceipt | null>;
	getAllForExpense(expenseId: string): Promise<Array<ExpenseReceipt>>;
	delete(id: string): Promise<void>;
}
