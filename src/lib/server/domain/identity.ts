import * as z from 'zod';

export const identitySchema = z.object({
	id: z.uuid(),
	userId: z.uuid(),
	provider: z.string(),
	providerSubject: z.string(),
	createdAt: z.date()
});

export type Identity = z.infer<typeof identitySchema>;
