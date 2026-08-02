import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import type { Database } from '$lib/server/infra/db/types';
import { pairBalance } from '$lib/server/infra/db/schema/pair-balance';
import { and, eq, or } from 'drizzle-orm';

export const getForPair =
	(db: Database): IPairBalanceRepository['getForPair'] =>
	async (groupId, userA, userB) => {
		const [row] = await db
			.select({
				fromUserId: pairBalance.fromUserId,
				toUserId: pairBalance.toUserId,
				amountCents: pairBalance.amountCents
			})
			.from(pairBalance)
			.where(
				and(
					eq(pairBalance.groupId, groupId),
					or(
						and(eq(pairBalance.fromUserId, userA), eq(pairBalance.toUserId, userB)),
						and(eq(pairBalance.fromUserId, userB), eq(pairBalance.toUserId, userA))
					)
				)
			);

		return row ?? null;
	};

export const replaceForPair =
	(db: Database): IPairBalanceRepository['replaceForPair'] =>
	async (groupId, userA, userB, next) => {
		await db
			.delete(pairBalance)
			.where(
				and(
					eq(pairBalance.groupId, groupId),
					or(
						and(eq(pairBalance.fromUserId, userA), eq(pairBalance.toUserId, userB)),
						and(eq(pairBalance.fromUserId, userB), eq(pairBalance.toUserId, userA))
					)
				)
			);

		if (next) {
			await db.insert(pairBalance).values({ groupId, ...next });
		}
	};

export const getAllForGroup =
	(db: Database): IPairBalanceRepository['getAllForGroup'] =>
	async (groupId) => {
		return await db.select().from(pairBalance).where(eq(pairBalance.groupId, groupId));
	};

export const replaceAllForGroup =
	(db: Database): IPairBalanceRepository['replaceAllForGroup'] =>
	async (groupId, balances) => {
		await db.delete(pairBalance).where(eq(pairBalance.groupId, groupId));

		if (balances.length > 0) {
			await db.insert(pairBalance).values(balances.map((balance) => ({ groupId, ...balance })));
		}
	};

export function pairBalanceRepoFor(db: Database): IPairBalanceRepository {
	return {
		getForPair: getForPair(db),
		replaceForPair: replaceForPair(db),
		getAllForGroup: getAllForGroup(db),
		replaceAllForGroup: replaceAllForGroup(db)
	};
}
