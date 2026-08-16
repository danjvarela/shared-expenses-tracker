import * as z from 'zod';

export const notificationSchema = z.object({
	id: z.uuid(),
	userId: z.uuid(),
	groupId: z.uuid(),
	type: z.enum(['expense_created', 'settlement_created', 'member_removed']),
	expenseId: z.uuid().nullable(),
	settlementId: z.uuid().nullable(),
	message: z.string().min(1),
	readAt: z.date().nullable(),
	createdAt: z.date()
});

export type Notification = z.infer<typeof notificationSchema>;
