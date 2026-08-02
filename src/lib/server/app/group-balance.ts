import { db } from '$lib/server/infra/db';
import { createExpenseRepository } from '$lib/server/infra/db/repositories/expense';
import { createSettlementRepository } from '$lib/server/infra/db/repositories/settlement';
import { createPairBalanceRepository } from '$lib/server/infra/db/repositories/pair-balance';
import { recomputeGroupBalances as recompute } from '$lib/server/app/pair-balance';

export async function recomputeGroupBalances(groupId: string): Promise<void> {
	const expenseRepo = createExpenseRepository(db);
	const settlementRepo = createSettlementRepository(db);
	const pairBalanceRepo = createPairBalanceRepository(db);

	const expenses = await expenseRepo.getAllForGroupWithSplits(groupId);
	const settlements = await settlementRepo.getAllForGroup(groupId);

	await recompute(pairBalanceRepo, groupId, expenses, settlements);
}

export async function getGroupBalances(groupId: string) {
	return createPairBalanceRepository(db).getAllForGroup(groupId);
}
