import type { PairBalance } from '$lib/server/domain/pair-balance';

export interface IPairBalanceRepository {
	getForPair(
		groupId: string,
		userA: string,
		userB: string
	): Promise<Pick<PairBalance, 'fromUserId' | 'toUserId' | 'amountCents'> | null>;

	replaceForPair(
		groupId: string,
		userA: string,
		userB: string,
		next: { fromUserId: string; toUserId: string; amountCents: number } | null
	): Promise<void>;

	getAllForGroup(groupId: string): Promise<Array<PairBalance>>;

	getNetForUserInGroups(userId: string, groupIds: Array<string>): Promise<Map<string, number>>;

	replaceAllForGroup(
		groupId: string,
		balances: Array<{ fromUserId: string; toUserId: string; amountCents: number }>
	): Promise<void>;
}
