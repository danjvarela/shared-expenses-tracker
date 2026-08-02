import type { ISettlementRepository } from '$lib/server/app/interfaces/repositories/settlement';
import type { Database } from '$lib/server/infra/db/types';
import { settlement } from '$lib/server/infra/db/schema/settlement';
import { eq } from 'drizzle-orm';

export const create =
	(db: Database): ISettlementRepository['create'] =>
	async (input) => {
		const [row] = await db.insert(settlement).values(input).returning();
		return row;
	};

export const getAllForGroup =
	(db: Database): ISettlementRepository['getAllForGroup'] =>
	async (groupId) => {
		return await db.select().from(settlement).where(eq(settlement.groupId, groupId));
	};
