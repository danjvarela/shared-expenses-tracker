import { AppError } from './error';
import { GroupHasOutstandingBalanceError } from './group';
import type { IGroupMemberRepository } from './interfaces/repositories/group-member';
import type { IPairBalanceRepository } from './interfaces/repositories/pair-balance';
import type { IGroupRepository } from './interfaces/repositories/group';
import type { IUnitOfWork } from './interfaces/unit-of-work';

export interface RemoveMemberRepos {
	pairBalanceRepo: IPairBalanceRepository;
	groupMemberRepo: IGroupMemberRepository;
	groupRepo: IGroupRepository;
}

export class UserToRemoveNotMemberOfGroupError extends AppError {
	constructor() {
		super('User to be removed is not member of the group');
	}
}
export class RemoverNotMemberOfGroupError extends AppError {
	constructor() {
		super('You are not member of the group', 403);
	}
}
export class HasOutstandingBalanceError extends AppError {
	constructor() {
		super('User to be removed still has balance to be settled');
	}
}

export type RemoveMemberResult = 'removed' | 'group-deleted';

export function createRemoveMemberService(deps: { uow: IUnitOfWork<RemoveMemberRepos> }) {
	async function kickUser(
		groupId: string,
		userId: string,
		removerId: string
	): Promise<RemoveMemberResult> {
		return deps.uow.run(async ({ pairBalanceRepo, groupMemberRepo, groupRepo }) => {
			const isRemoverAMember = await groupMemberRepo.isMember(groupId, removerId);
			if (!isRemoverAMember) throw new RemoverNotMemberOfGroupError();

			const isUserAMember = await groupMemberRepo.isMember(groupId, userId);
			if (!isUserAMember) throw new UserToRemoveNotMemberOfGroupError();

			if (removerId === userId) {
				const memberCount = await groupMemberRepo.countByGroup(groupId);
				if (memberCount <= 1) {
					const balances = await pairBalanceRepo.getAllForGroup(groupId);
					if (balances.length > 0) throw new GroupHasOutstandingBalanceError();
					await groupRepo.delete(groupId);
					return 'group-deleted';
				}
				await groupMemberRepo.remove(groupId, userId);
				return 'removed';
			}

			const hasOutstandingBalance = await pairBalanceRepo.hasBalanceForUserInGroup(userId, groupId);
			if (hasOutstandingBalance) throw new HasOutstandingBalanceError();

			await groupMemberRepo.remove(groupId, userId);
			return 'removed';
		});
	}

	return { kickUser };
}

export type RemoveMemberService = ReturnType<typeof createRemoveMemberService>;
