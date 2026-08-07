import type { ISettlementRepository } from '$lib/server/app/interfaces/repositories/settlement';
import type { Database } from '$lib/server/infra/db/types';
import { settlement } from '$lib/server/infra/db/schema/settlement';
import { eq } from 'drizzle-orm';

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
		const [row] = await db.select().from(settlement).where(eq(settlement.id, id));
		return row;
	};

export function createSettlementRepository(db: Database): ISettlementRepository {
	return {
		create: create(db),
		getAllForGroup: getAllForGroup(db),
		getById: getById(db)
	};
}
