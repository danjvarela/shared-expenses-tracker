import * as z from 'zod';

export const pairBalanceSchema = z.object({
	id: z.uuid(),
	groupId: z.uuid(),
	fromUserId: z.uuid(),
	toUserId: z.uuid(),
	amountCents: z.number().int().positive(),
	createdAt: z.date(),
	updatedAt: z.date()
});

export type PairBalance = z.infer<typeof pairBalanceSchema>;
