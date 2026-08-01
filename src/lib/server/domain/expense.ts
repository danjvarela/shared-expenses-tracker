import * as z from 'zod';

export const expenseSchema = z.object({
	id: z.uuid(),
	groupId: z.uuid(),
	paidByUserId: z.uuid(),
	categoryId: z.uuid().nullable(),
	description: z.string().min(1),
	amountCents: z.number().int().positive(),
	createdAt: z.date(),
	updatedAt: z.date()
});

export type Expense = z.infer<typeof expenseSchema>;
