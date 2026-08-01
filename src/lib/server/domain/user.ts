import * as z from 'zod';

export const userSchema = z.object({
	id: z.uuid(),
	displayName: z.string(),
	email: z.email()
});

export type User = z.infer<typeof userSchema>;
