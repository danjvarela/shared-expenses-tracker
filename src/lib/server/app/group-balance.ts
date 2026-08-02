import { db } from '$lib/server/infra/db';
import * as expenseRepo from '$lib/server/infra/db/repositories/expense';
import * as settlementRepo from '$lib/server/infra/db/repositories/settlement';
import { pairBalanceRepoFor, getAllForGroup } from '$lib/server/infra/db/repositories/pair-balance';
import { recomputeGroupBalances as recompute } from '$lib/server/app/pair-balance';

export async function recomputeGroupBalances(groupId: string): Promise<void> {
	const expenses = await expenseRepo.getAllForGroupWithSplits(db)(groupId);
	const settlements = await settlementRepo.getAllForGroup(db)(groupId);

	await recompute(pairBalanceRepoFor(db), groupId, expenses, settlements);
}

export async function getGroupBalances(groupId: string) {
	return getAllForGroup(db)(groupId);
}
