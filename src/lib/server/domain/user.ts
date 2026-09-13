import * as z from 'zod';

export const userSchema = z.object({
	id: z.uuid(),
	displayName: z.string(),
	email: z.email(),
	avatarStorageKey: z.string().nullable(),
	avatarMime: z.string().nullable()
});

export type User = z.infer<typeof userSchema>;
