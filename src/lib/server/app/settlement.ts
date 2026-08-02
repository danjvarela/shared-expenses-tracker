import { db } from '$lib/server/infra/db';
import * as settlementRepo from '$lib/server/infra/db/repositories/settlement';
import { pairBalanceRepoFor } from '$lib/server/infra/db/repositories/pair-balance';
import { applyPairBalanceDeltas, settlementDelta } from '$lib/server/app/pair-balance';
import type { Settlement } from '$lib/server/domain/settlement';

export interface SettlementInput {
	groupId: string;
	fromUserId: string;
	toUserId: string;
	amountCents: number;
}

export async function createSettlement(input: SettlementInput): Promise<Settlement> {
	return db.transaction(async (tx) => {
		const created = await settlementRepo.create(tx)(input);

		await applyPairBalanceDeltas(pairBalanceRepoFor(tx), input.groupId, [settlementDelta(input)]);

		return created;
	});
}
