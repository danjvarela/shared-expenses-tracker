import * as z from 'zod';

export const groupMemberSchema = z.object({
	id: z.uuid(),
	groupId: z.uuid(),
	userId: z.uuid(),
	createdAt: z.date()
});

export type GroupMember = z.infer<typeof groupMemberSchema>;
