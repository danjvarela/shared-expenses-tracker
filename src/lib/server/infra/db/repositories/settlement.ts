import type { ISettlementRepository } from '$lib/server/app/interfaces/repositories/settlement';
import type { Database } from '$lib/server/infra/db/types';
import { settlement } from '$lib/server/infra/db/schema/settlement';
import { user } from '$lib/server/infra/db/schema/user';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

const create =
	(db: Database): ISettlementRepository['create'] =>
	async (input) => {
		const [row] = await db.insert(settlement).values(input).returning();
		return row;
	};

const getAllForGroup =
	(db: Database): ISettlementRepository['getAllForGroup'] =>
	async (groupId) => {
		return await db.select().from(settlement).where(eq(settlement.groupId, groupId));
	};

const getById =
	(db: Database): ISettlementRepository['getById'] =>
	async (id) => {
		const fromUser = alias(user, 'fromUser');
		const toUser = alias(user, 'toUser');
		const [row] = await db
			.select({
				id: settlement.id,
				groupId: settlement.groupId,
				fromUserId: settlement.fromUserId,
				toUserId: settlement.toUserId,
				amountCents: settlement.amountCents,
				createdAt: settlement.createdAt,
				fromUserName: fromUser.displayName,
				toUserName: toUser.displayName
			})
			.from(settlement)
			.innerJoin(fromUser, eq(fromUser.id, settlement.fromUserId))
			.innerJoin(toUser, eq(toUser.id, settlement.toUserId))
			.where(eq(settlement.id, id));
		if (!row) return undefined;
		return {
			...row,
			fromUserName: row.fromUserName ?? 'Unknown',
			toUserName: row.toUserName ?? 'Unknown'
		};
	};

export function createSettlementRepository(db: Database): ISettlementRepository {
	return {
		create: create(db),
		getAllForGroup: getAllForGroup(db),
		getById: getById(db)
	};
}
