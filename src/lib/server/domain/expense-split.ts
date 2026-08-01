import * as z from 'zod';

export const expenseSplitSchema = z.object({
	id: z.uuid(),
	expenseId: z.uuid(),
	userId: z.uuid(),
	amountCents: z.number().int().positive(),
	createdAt: z.date()
});

export type ExpenseSplit = z.infer<typeof expenseSplitSchema>;
