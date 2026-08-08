import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type { ISettlementRepository } from '$lib/server/app/interfaces/repositories/settlement';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { INotificationRepository } from '$lib/server/app/interfaces/repositories/notification';
import { applyPairBalanceDeltas, settlementDelta } from '$lib/server/app/pair-balance';
import type { Settlement } from '$lib/server/domain/settlement';
import { formatAmountCents } from '$lib/currency';

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

export function createSettlementService(deps: {
	uow: IUnitOfWork<SettlementRepos>;
	groupRepo: IGroupRepository;
	groupMemberRepo: IGroupMemberRepository;
	notificationRepo: INotificationRepository;
}) {
	async function notifySettlementCreated(settlement: Settlement) {
		try {
			const [group, members] = await Promise.all([
				deps.groupRepo.getById(settlement.groupId),
				deps.groupMemberRepo.getAllForGroupWithUser(settlement.groupId)
			]);
			if (!group) return;

			const actor = members.find((member) => member.userId === settlement.fromUserId);
			const actorName = actor?.displayName ?? 'Someone';
			const amount = formatAmountCents(settlement.amountCents, group.currencyCode);
			const message = `${actorName} settled ${amount} with you`;

			await deps.notificationRepo.create({
				userId: settlement.toUserId,
				groupId: settlement.groupId,
				type: 'settlement_created',
				expenseId: null,
				settlementId: settlement.id,
				message
			});
		} catch (err) {
			console.error('Failed to create settlement-created notification', err);
		}
	}

	async function createSettlement(input: SettlementInput): Promise<Settlement> {
		const created = await deps.uow.run(async ({ settlementRepo, pairBalanceRepo }) => {
			const created = await settlementRepo.create(input);

			await applyPairBalanceDeltas(pairBalanceRepo, input.groupId, [settlementDelta(input)]);

			return created;
		});

		await notifySettlementCreated(created);

		return created;
	}

	return { createSettlement };
}

export type SettlementService = ReturnType<typeof createSettlementService>;
