import * as z from 'zod';

export const sessionSchema = z.object({
	id: z.string(),
	userId: z.uuid(),
	expiresAt: z.date()
});

export type Session = z.infer<typeof sessionSchema>;
