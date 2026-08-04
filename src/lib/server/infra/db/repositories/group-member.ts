import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { Database } from '$lib/server/infra/db/types';
import { groupMember } from '$lib/server/infra/db/schema/group-member';
import { user } from '$lib/server/infra/db/schema/user';
import { and, eq } from 'drizzle-orm';

const getAllForGroupWithUser =
	(db: Database): IGroupMemberRepository['getAllForGroupWithUser'] =>
	async (groupId) => {
		return await db
			.select({
				userId: groupMember.userId,
				displayName: user.displayName,
				defaultSplitPercent: groupMember.defaultSplitPercent
			})
			.from(groupMember)
			.innerJoin(user, eq(user.id, groupMember.userId))
			.where(eq(groupMember.groupId, groupId))
			.orderBy(groupMember.createdAt);
	};

const updateDefaultSplitPercents =
	(db: Database): IGroupMemberRepository['updateDefaultSplitPercents'] =>
	async (groupId, entries) => {
		await db.transaction(async (tx) => {
			await Promise.all(
				entries.map((entry) =>
					tx
						.update(groupMember)
						.set({ defaultSplitPercent: entry.defaultSplitPercent })
						.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, entry.userId)))
				)
			);
		});
	};

export function createGroupMemberRepository(db: Database): IGroupMemberRepository {
	return {
		getAllForGroupWithUser: getAllForGroupWithUser(db),
		updateDefaultSplitPercents: updateDefaultSplitPercents(db)
	};
}
