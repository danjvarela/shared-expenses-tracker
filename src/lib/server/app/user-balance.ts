import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';

export interface UserBalanceDeps {
	groupRepo: IGroupRepository;
	pairBalanceRepo: IPairBalanceRepository;
}

export interface GroupWithNetBalance {
	id: string;
	name: string;
	currencyCode: string;
	createdAt: Date;
	netCents: number;
}

export function createUserBalanceService(deps: UserBalanceDeps) {
	async function getUserGroupBalances(userId: string): Promise<Array<GroupWithNetBalance>> {
		const groups = await deps.groupRepo.getAll(userId);
		const netByGroup = await deps.pairBalanceRepo.getNetForUserInGroups(
			userId,
			groups.map((group) => group.id)
		);

		return groups.map((group) => ({
			...group,
			netCents: netByGroup.get(group.id) ?? 0
		}));
	}

	return { getUserGroupBalances };
}

export type UserBalanceService = ReturnType<typeof createUserBalanceService>;
