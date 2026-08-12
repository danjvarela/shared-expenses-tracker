import { AppError } from './error';
import type { IGroupMemberRepository } from './interfaces/repositories/group-member';
import type { IPairBalanceRepository } from './interfaces/repositories/pair-balance';
import type { IUnitOfWork } from './interfaces/unit-of-work';

export interface RemoveMemberRepos {
	pairBalanceRepo: IPairBalanceRepository;
	groupMemberRepo: IGroupMemberRepository;
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

export class UserCannotRemoveItselfError extends AppError {
	constructor() {
		super('Leaving the group not implemented yet', 403);
	}
}

export function createRemoveMemberService(deps: { uow: IUnitOfWork<RemoveMemberRepos> }) {
	async function kickUser(groupId: string, userId: string, removerId: string) {
		return deps.uow.run(async ({ pairBalanceRepo, groupMemberRepo }) => {
			const isRemoverAMember = await groupMemberRepo.isMember(groupId, removerId);
			if (!isRemoverAMember) throw new RemoverNotMemberOfGroupError();

			if (removerId === userId) throw new UserCannotRemoveItselfError();

			const isUserAMember = await groupMemberRepo.isMember(groupId, userId);
			if (!isUserAMember) throw new UserToRemoveNotMemberOfGroupError();

			const hasOutstandingBalance = await pairBalanceRepo.hasBalanceForUserInGroup(userId, groupId);
			if (hasOutstandingBalance) throw new HasOutstandingBalanceError();

			await groupMemberRepo.remove(groupId, userId);
		});
	}

	return { kickUser };
}

export type RemoveMemberService = ReturnType<typeof createRemoveMemberService>;
