import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';

export interface DirectedAmount {
	fromUserId: string;
	toUserId: string;
	amountCents: number;
}

/**
 * Applies a signed delta (owed from userA to userB) to the current directed balance
 * for that pair, returning the new normalized directed balance, or null if the net is zero.
 */
export function applyPairDelta(
	current: DirectedAmount | null,
	userA: string,
	userB: string,
	deltaAToB: number
): DirectedAmount | null {
	const currentNetAToB = current
		? current.fromUserId === userA
			? current.amountCents
			: -current.amountCents
		: 0;

	const newNetAToB = currentNetAToB + deltaAToB;

	if (newNetAToB === 0) return null;
	if (newNetAToB > 0) return { fromUserId: userA, toUserId: userB, amountCents: newNetAToB };
	return { fromUserId: userB, toUserId: userA, amountCents: -newNetAToB };
}

export interface ExpenseSplitInput {
	userId: string;
	amountCents: number;
}

/**
 * A split owed by the payer to themselves carries no debt, so it's excluded.
 */
export function expenseDeltas(
	paidByUserId: string,
	splits: Array<ExpenseSplitInput>
): Array<{ userA: string; userB: string; deltaAToB: number }> {
	return splits
		.filter((split) => split.userId !== paidByUserId)
		.map((split) => ({
			userA: split.userId,
			userB: paidByUserId,
			deltaAToB: split.amountCents
		}));
}

export interface SettlementInput {
	fromUserId: string;
	toUserId: string;
	amountCents: number;
}

export function settlementDelta(settlement: SettlementInput): {
	userA: string;
	userB: string;
	deltaAToB: number;
} {
	return {
		userA: settlement.fromUserId,
		userB: settlement.toUserId,
		deltaAToB: -settlement.amountCents
	};
}

export function pairKey(userA: string, userB: string): string {
	return [userA, userB].sort().join('|');
}

/**
 * Nets a flat list of signed (userA -> userB) deltas down to at most one
 * directed balance per unordered pair, matching the pair_balance invariant.
 */
export function netDeltas(
	deltas: Array<{ userA: string; userB: string; deltaAToB: number }>
): Map<string, DirectedAmount> {
	const netByPair = new Map<string, DirectedAmount>();

	for (const { userA, userB, deltaAToB } of deltas) {
		const key = pairKey(userA, userB);
		const current = netByPair.get(key) ?? null;
		const next = applyPairDelta(current, userA, userB, deltaAToB);
		if (next) netByPair.set(key, next);
		else netByPair.delete(key);
	}

	return netByPair;
}

/**
 * Applies a batch of deltas for one group to pair_balance, one read-modify-write
 * per affected pair. Callers are responsible for wrapping this in a transaction
 * alongside the source-of-truth writes (expense/settlement) it accompanies.
 */
export async function applyPairBalanceDeltas(
	pairBalanceRepo: IPairBalanceRepository,
	groupId: string,
	deltas: Array<{ userA: string; userB: string; deltaAToB: number }>
): Promise<void> {
	for (const { fromUserId, toUserId, amountCents } of netDeltas(deltas).values()) {
		const current = await pairBalanceRepo.getForPair(groupId, fromUserId, toUserId);
		const next = applyPairDelta(current, fromUserId, toUserId, amountCents);
		await pairBalanceRepo.replaceForPair(groupId, fromUserId, toUserId, next);
	}
}

export interface GroupBalanceSourceExpense {
	paidByUserId: string;
	splits: Array<ExpenseSplitInput>;
}

/**
 * Recomputes a Group's pair_balance from scratch, straight from Expense/ExpenseSplit/
 * Settlement. This is both the drift-repair path and the oracle the incremental path
 * (applyPairBalanceDeltas) is tested against.
 */
export async function recomputeGroupBalances(
	pairBalanceRepo: IPairBalanceRepository,
	groupId: string,
	expenses: Array<GroupBalanceSourceExpense>,
	settlements: Array<SettlementInput>
): Promise<void> {
	const deltas = [
		...expenses.flatMap((expense) => expenseDeltas(expense.paidByUserId, expense.splits)),
		...settlements.map(settlementDelta)
	];

	const netByPair = netDeltas(deltas);

	await pairBalanceRepo.replaceAllForGroup(groupId, Array.from(netByPair.values()));
}
