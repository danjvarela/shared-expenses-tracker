import type { PairBalance } from '$lib/server/domain/pair-balance';

export interface UserDebt {
	groupId: string;
	groupName: string;
	groupCurrencyCode: string;
	groupAvatarIcon: string | null;
	counterpartyId: string;
	counterpartyName: string;
	counterpartyAvatarStorageKey: string | null;
	amountCents: number;
}

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

	hasBalanceForUserInGroup(userId: string, groupId: string): Promise<boolean>;

	getDebtsForUser(userId: string): Promise<Array<UserDebt>>;

	getDebtsForUserInGroup(userId: string, groupId: string): Promise<Array<UserDebt>>;

	replaceAllForGroup(
		groupId: string,
		balances: Array<{ fromUserId: string; toUserId: string; amountCents: number }>
	): Promise<void>;
}
