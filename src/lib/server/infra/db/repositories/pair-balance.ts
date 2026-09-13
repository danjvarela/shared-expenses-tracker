import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import type { Database } from '$lib/server/infra/db/types';
import { pairBalance } from '$lib/server/infra/db/schema/pair-balance';
import { group } from '$lib/server/infra/db/schema/group';
import { user } from '$lib/server/infra/db/schema/user';
import { and, eq, gt, inArray, or } from 'drizzle-orm';

const getForPair =
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

const replaceForPair =
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

const getAllForGroup =
	(db: Database): IPairBalanceRepository['getAllForGroup'] =>
	async (groupId) => {
		return await db.select().from(pairBalance).where(eq(pairBalance.groupId, groupId));
	};

const getNetForUserInGroups =
	(db: Database): IPairBalanceRepository['getNetForUserInGroups'] =>
	async (userId, groupIds) => {
		const net = new Map<string, number>();
		if (groupIds.length === 0) return net;

		const rows = await db
			.select({
				groupId: pairBalance.groupId,
				fromUserId: pairBalance.fromUserId,
				toUserId: pairBalance.toUserId,
				amountCents: pairBalance.amountCents
			})
			.from(pairBalance)
			.where(
				and(
					inArray(pairBalance.groupId, groupIds),
					or(eq(pairBalance.fromUserId, userId), eq(pairBalance.toUserId, userId))
				)
			);

		for (const row of rows) {
			const signedAmount = row.toUserId === userId ? row.amountCents : -row.amountCents;
			net.set(row.groupId, (net.get(row.groupId) ?? 0) + signedAmount);
		}

		return net;
	};

const getDebtsForUser =
	(db: Database): IPairBalanceRepository['getDebtsForUser'] =>
	async (userId) => {
		return await db
			.select({
				groupId: pairBalance.groupId,
				groupName: group.name,
				groupCurrencyCode: group.currencyCode,
				groupAvatarIcon: group.avatarIcon,
				counterpartyId: pairBalance.toUserId,
				counterpartyName: user.displayName,
				counterpartyAvatarStorageKey: user.avatarStorageKey,
				amountCents: pairBalance.amountCents
			})
			.from(pairBalance)
			.innerJoin(group, eq(group.id, pairBalance.groupId))
			.innerJoin(user, eq(user.id, pairBalance.toUserId))
			.where(and(eq(pairBalance.fromUserId, userId), gt(pairBalance.amountCents, 0)));
	};

const getDebtsForUserInGroup =
	(db: Database): IPairBalanceRepository['getDebtsForUserInGroup'] =>
	async (userId, groupId) => {
		return await db
			.select({
				groupId: pairBalance.groupId,
				groupName: group.name,
				groupCurrencyCode: group.currencyCode,
				groupAvatarIcon: group.avatarIcon,
				counterpartyId: pairBalance.toUserId,
				counterpartyName: user.displayName,
				counterpartyAvatarStorageKey: user.avatarStorageKey,
				amountCents: pairBalance.amountCents
			})
			.from(pairBalance)
			.innerJoin(group, eq(group.id, pairBalance.groupId))
			.innerJoin(user, eq(user.id, pairBalance.toUserId))
			.where(
				and(
					eq(pairBalance.groupId, groupId),
					eq(pairBalance.fromUserId, userId),
					gt(pairBalance.amountCents, 0)
				)
			);
	};

const replaceAllForGroup =
	(db: Database): IPairBalanceRepository['replaceAllForGroup'] =>
	async (groupId, balances) => {
		await db.delete(pairBalance).where(eq(pairBalance.groupId, groupId));

		if (balances.length > 0) {
			await db.insert(pairBalance).values(balances.map((balance) => ({ groupId, ...balance })));
		}
	};

const hasBalanceForUserInGroup =
	(db: Database): IPairBalanceRepository['hasBalanceForUserInGroup'] =>
	async (userId, groupId) => {
		const rows = await db
			.select({ userId: pairBalance.fromUserId })
			.from(pairBalance)
			.where(
				and(
					eq(pairBalance.groupId, groupId),
					or(eq(pairBalance.fromUserId, userId), eq(pairBalance.toUserId, userId))
				)
			)
			.limit(1);

		return rows.length > 0;
	};

export function createPairBalanceRepository(db: Database): IPairBalanceRepository {
	return {
		getForPair: getForPair(db),
		replaceForPair: replaceForPair(db),
		getAllForGroup: getAllForGroup(db),
		getNetForUserInGroups: getNetForUserInGroups(db),
		getDebtsForUser: getDebtsForUser(db),
		getDebtsForUserInGroup: getDebtsForUserInGroup(db),
		replaceAllForGroup: replaceAllForGroup(db),
		hasBalanceForUserInGroup: hasBalanceForUserInGroup(db)
	};
}
