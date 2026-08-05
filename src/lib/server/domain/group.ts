import * as z from 'zod';

export const groupSchema = z.object({
	id: z.uuid(),
	name: z.string().min(1),
	currencyCode: z.string().min(1),
	avatarIcon: z.string().nullable(),
	createdAt: z.date()
});

export type Group = z.infer<typeof groupSchema>;
