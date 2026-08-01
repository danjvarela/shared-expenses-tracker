import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import { db } from '$lib/server/infra/db';
import { group } from '$lib/server/infra/db/schema/group';
import { groupMember } from '$lib/server/infra/db/schema/group-member';
import { eq } from 'drizzle-orm';

export const getAll: IGroupRepository['getAll'] = async (userId) => {
	const rows = await db
		.select({ id: group.id, name: group.name, createdAt: group.createdAt })
		.from(group)
		.innerJoin(groupMember, eq(groupMember.groupId, group.id))
		.where(eq(groupMember.userId, userId));

	return rows;
};
