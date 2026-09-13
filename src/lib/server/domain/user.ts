import * as z from 'zod';

export const userSchema = z.object({
	id: z.uuid(),
	displayName: z.string(),
	email: z.email().nullable(),
	avatarStorageKey: z.string().nullable(),
	avatarMime: z.string().nullable(),
	deletedAt: z.date().nullable()
});

export type User = z.infer<typeof userSchema>;
