import { AppError } from './error';
import { GroupHasOutstandingBalanceError } from './group';
import type { IGroupMemberRepository } from './interfaces/repositories/group-member';
import type { IPairBalanceRepository } from './interfaces/repositories/pair-balance';
import type { IGroupRepository } from './interfaces/repositories/group';
import type { INotificationRepository } from './interfaces/repositories/notification';
import type { IUnitOfWork } from './interfaces/unit-of-work';
import { NOOP_LOGGER, type ILogger } from './interfaces/logger';

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

type KickOutcome =
	| { result: 'group-deleted' }
	| {
			result: 'removed';
			removedName: string;
			removerName: string;
			groupName: string;
			recipientIds: string[];
	  };

function displayNameOf(
	members: Array<{ userId: string; displayName: string }>,
	userId: string
): string {
	return members.find((member) => member.userId === userId)?.displayName ?? 'Someone';
}

export function createRemoveMemberService(deps: {
	uow: IUnitOfWork<RemoveMemberRepos>;
	notificationRepo: INotificationRepository;
	logger?: ILogger;
}) {
	const logger = deps.logger ?? NOOP_LOGGER;
	async function notifyMemberRemoved(
		groupId: string,
		outcome: Extract<KickOutcome, { result: 'removed' }>
	) {
		try {
			const message = `${outcome.removerName} removed ${outcome.removedName} from ${outcome.groupName}`;
			await Promise.all(
				outcome.recipientIds.map((userId) =>
					deps.notificationRepo.create({
						userId,
						groupId,
						type: 'member_removed',
						expenseId: null,
						settlementId: null,
						message
					})
				)
			);
		} catch (err) {
			logger.error('failed to create member-removed notifications', { err });
		}
	}

	async function kickUser(
		groupId: string,
		userId: string,
		removerId: string
	): Promise<RemoveMemberResult> {
		const outcome = await deps.uow.run<KickOutcome>(
			async ({ pairBalanceRepo, groupMemberRepo, groupRepo }) => {
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
						return { result: 'group-deleted' as const };
					}
					return removedOutcome(groupId, userId, removerId, groupRepo, groupMemberRepo);
				}

				const hasOutstandingBalance = await pairBalanceRepo.hasBalanceForUserInGroup(
					userId,
					groupId
				);
				if (hasOutstandingBalance) throw new HasOutstandingBalanceError();

				return removedOutcome(groupId, userId, removerId, groupRepo, groupMemberRepo);
			}
		);

		if (outcome.result === 'removed') {
			await notifyMemberRemoved(groupId, outcome);
		}

		return outcome.result;
	}

	async function removedOutcome(
		groupId: string,
		userId: string,
		removerId: string,
		groupRepo: IGroupRepository,
		groupMemberRepo: IGroupMemberRepository
	): Promise<Extract<KickOutcome, { result: 'removed' }>> {
		const [group, members] = await Promise.all([
			groupRepo.getById(groupId),
			groupMemberRepo.getAllForGroupWithUser(groupId)
		]);
		await groupMemberRepo.remove(groupId, userId);
		return {
			result: 'removed',
			removedName: displayNameOf(members, userId),
			removerName: displayNameOf(members, removerId),
			groupName: group?.name ?? 'the group',
			recipientIds: members
				.filter((member) => member.userId !== userId && member.userId !== removerId)
				.map((member) => member.userId)
		};
	}

	return { kickUser };
}

export type RemoveMemberService = ReturnType<typeof createRemoveMemberService>;
