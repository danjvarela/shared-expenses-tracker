import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type {
	IPairBalanceRepository,
	UserDebt
} from '$lib/server/app/interfaces/repositories/pair-balance';

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

	async function getUserDebts(userId: string): Promise<Array<UserDebt>> {
		const debts = await deps.pairBalanceRepo.getDebtsForUser(userId);
		return debts.toSorted((a, b) => b.amountCents - a.amountCents);
	}

	return { getUserGroupBalances, getUserDebts };
}

export type UserBalanceService = ReturnType<typeof createUserBalanceService>;
