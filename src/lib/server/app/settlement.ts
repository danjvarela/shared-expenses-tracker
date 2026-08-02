import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type { ISettlementRepository } from '$lib/server/app/interfaces/repositories/settlement';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import { applyPairBalanceDeltas, settlementDelta } from '$lib/server/app/pair-balance';
import type { Settlement } from '$lib/server/domain/settlement';

export interface SettlementInput {
	groupId: string;
	fromUserId: string;
	toUserId: string;
	amountCents: number;
}

export interface SettlementRepos {
	settlementRepo: ISettlementRepository;
	pairBalanceRepo: IPairBalanceRepository;
}

export function createSettlementService(deps: { uow: IUnitOfWork<SettlementRepos> }) {
	async function createSettlement(input: SettlementInput): Promise<Settlement> {
		return deps.uow.run(async ({ settlementRepo, pairBalanceRepo }) => {
			const created = await settlementRepo.create(input);

			await applyPairBalanceDeltas(pairBalanceRepo, input.groupId, [settlementDelta(input)]);

			return created;
		});
	}

	return { createSettlement };
}

export type SettlementService = ReturnType<typeof createSettlementService>;
