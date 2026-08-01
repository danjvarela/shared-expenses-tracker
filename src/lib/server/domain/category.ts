import * as z from 'zod';

export const categorySchema = z.object({
	id: z.uuid(),
	name: z.string().min(1),
	icon: z.string().min(1),
	createdAt: z.date()
});

export type Category = z.infer<typeof categorySchema>;
