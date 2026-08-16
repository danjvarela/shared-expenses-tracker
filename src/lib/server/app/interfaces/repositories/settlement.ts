import type { Settlement } from '$lib/server/domain/settlement';

export interface SettlementWithNames extends Settlement {
	fromUserName: string;
	toUserName: string;
}

export interface ISettlementRepository {
	create(input: {
		groupId: string;
		fromUserId: string;
		toUserId: string;
		amountCents: number;
	}): Promise<Settlement>;

	getAllForGroup(groupId: string): Promise<Array<Settlement>>;

	getById(id: string): Promise<SettlementWithNames | undefined>;
}
