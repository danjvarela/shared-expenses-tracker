import * as z from 'zod';

export const groupMemberSchema = z.object({
	id: z.uuid(),
	groupId: z.uuid(),
	userId: z.uuid(),
	defaultSplitPercent: z.number().min(0).max(100).nullable(),
	createdAt: z.date()
});

export type GroupMember = z.infer<typeof groupMemberSchema>;
