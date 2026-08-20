import * as z from 'zod';

export const expenseReceiptSchema = z.object({
	id: z.uuid(),
	expenseGroupId: z.uuid(),
	storageKey: z.string().min(1),
	mime: z.string().min(1),
	sizeBytes: z.number().int().positive(),
	originalFilename: z.string().nullable(),
	uploadedByUserId: z.uuid(),
	uploadedAt: z.date()
});

export type ExpenseReceipt = z.infer<typeof expenseReceiptSchema>;
