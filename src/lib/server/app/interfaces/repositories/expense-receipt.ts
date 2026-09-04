import type { ExpenseReceipt } from '$lib/server/domain/expense-receipt';

export interface ExpenseReceiptCreateInput {
	expenseGroupId: string;
	storageKey: string;
	mime: string;
	sizeBytes: number;
	originalFilename: string | null;
	uploadedByUserId: string;
}

export interface IExpenseReceiptRepository {
	create(input: ExpenseReceiptCreateInput): Promise<ExpenseReceipt>;
	getById(id: string): Promise<ExpenseReceipt | null>;
	getAllForExpenseGroup(expenseGroupId: string): Promise<Array<ExpenseReceipt>>;
	getAllStorageKeys(): Promise<string[]>;
	delete(id: string): Promise<void>;
}
