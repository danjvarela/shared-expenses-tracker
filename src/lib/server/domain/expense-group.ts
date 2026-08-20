import * as z from 'zod';

export const expenseGroupSchema = z.object({
	id: z.uuid(),
	groupId: z.uuid(),
	createdAt: z.date()
});

export type ExpenseGroup = z.infer<typeof expenseGroupSchema>;
