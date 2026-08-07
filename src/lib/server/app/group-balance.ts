import type { IExpenseRepository } from '$lib/server/app/interfaces/repositories/expense';
import type { ISettlementRepository } from '$lib/server/app/interfaces/repositories/settlement';
import type {
	IPairBalanceRepository,
	UserDebt
} from '$lib/server/app/interfaces/repositories/pair-balance';
import { recomputeGroupBalances as recompute } from '$lib/server/app/pair-balance';

export interface GroupBalanceDeps {
	expenseRepo: IExpenseRepository;
	settlementRepo: ISettlementRepository;
	pairBalanceRepo: IPairBalanceRepository;
}

export function createGroupBalanceService(deps: GroupBalanceDeps) {
	async function recomputeGroupBalances(groupId: string): Promise<void> {
		const expenses = await deps.expenseRepo.getAllForGroupWithSplits(groupId);
		const settlements = await deps.settlementRepo.getAllForGroup(groupId);

		await recompute(deps.pairBalanceRepo, groupId, expenses, settlements);
	}

	async function getGroupBalances(groupId: string) {
		return deps.pairBalanceRepo.getAllForGroup(groupId);
	}

	async function getDebtsForUserInGroup(userId: string, groupId: string): Promise<Array<UserDebt>> {
		return deps.pairBalanceRepo.getDebtsForUserInGroup(userId, groupId);
	}

	return { recomputeGroupBalances, getGroupBalances, getDebtsForUserInGroup };
}

export type GroupBalanceService = ReturnType<typeof createGroupBalanceService>;
