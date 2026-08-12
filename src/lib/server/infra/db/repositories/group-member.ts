import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { Database } from '$lib/server/infra/db/types';
import { groupMember } from '$lib/server/infra/db/schema/group-member';
import { user } from '$lib/server/infra/db/schema/user';
import { and, count, eq } from 'drizzle-orm';

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

const create =
	(db: Database): IGroupMemberRepository['create'] =>
	async (groupId, userId) => {
		await db.insert(groupMember).values({ groupId, userId });
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

const isMember =
	(db: Database): IGroupMemberRepository['isMember'] =>
	async (groupId, userId) => {
		const [row] = await db
			.select({ userId: groupMember.userId })
			.from(groupMember)
			.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));

		return row !== undefined;
	};

const countByGroup =
	(db: Database): IGroupMemberRepository['countByGroup'] =>
	async (groupId) => {
		const [row] = await db
			.select({ total: count() })
			.from(groupMember)
			.where(eq(groupMember.groupId, groupId));

		return row?.total ?? 0;
	};

const remove =
	(db: Database): IGroupMemberRepository['remove'] =>
	async (groupId, userId) => {
		await db
			.delete(groupMember)
			.where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));
	};

export function createGroupMemberRepository(db: Database): IGroupMemberRepository {
	return {
		getAllForGroupWithUser: getAllForGroupWithUser(db),
		create: create(db),
		updateDefaultSplitPercents: updateDefaultSplitPercents(db),
		isMember: isMember(db),
		countByGroup: countByGroup(db),
		remove: remove(db)
	};
}
