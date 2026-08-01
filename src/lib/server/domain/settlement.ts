import * as z from 'zod';

export const settlementSchema = z.object({
	id: z.uuid(),
	groupId: z.uuid(),
	fromUserId: z.uuid(),
	toUserId: z.uuid(),
	amountCents: z.number().int().positive(),
	createdAt: z.date()
});

export type Settlement = z.infer<typeof settlementSchema>;
