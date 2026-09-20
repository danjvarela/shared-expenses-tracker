import * as z from 'zod';

export const expenseGroupSchema = z.object({
	id: z.uuid(),
	groupId: z.uuid(),
	name: z.string().nullable(),
	createdAt: z.date()
});

export type ExpenseGroup = z.infer<typeof expenseGroupSchema>;
