import type {
	IGroupMemberRepository,
	GroupMemberWithUser
} from '$lib/server/app/interfaces/repositories/group-member';
import type { IIdentityRepository } from '$lib/server/app/interfaces/repositories/identity';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import { AppError } from '$lib/server/app/error';

const SUM_TOLERANCE = 0.01;

export class InvalidDefaultSplitError extends AppError {
	constructor(sum: number) {
		super(`Default split percentages must sum to 100, got ${sum}`);
	}
}

export interface GroupMemberWithStatus extends GroupMemberWithUser {
	invitedPending: boolean;
	hasOutstandingBalance: boolean;
}

export function createGroupMemberService(deps: {
	groupMemberRepo: IGroupMemberRepository;
	identityRepo: IIdentityRepository;
	pairBalanceRepo: IPairBalanceRepository;
}) {
	async function getGroupMembers(groupId: string): Promise<Array<GroupMemberWithUser>> {
		return deps.groupMemberRepo.getAllForGroupWithUser(groupId);
	}

	async function getGroupMembersWithStatus(groupId: string): Promise<Array<GroupMemberWithStatus>> {
		const members = await deps.groupMemberRepo.getAllForGroupWithUser(groupId);
		return Promise.all(
			members.map(async (member) => ({
				...member,
				invitedPending: !(await deps.identityRepo.hasIdentityForUser(member.userId)),
				hasOutstandingBalance: await deps.pairBalanceRepo.hasBalanceForUserInGroup(
					member.userId,
					groupId
				)
			}))
		);
	}

	async function updateDefaultSplitPercents(
		groupId: string,
		entries: Array<{ userId: string; defaultSplitPercent: number | null }>
	): Promise<void> {
		const set = entries.filter(
			(entry): entry is { userId: string; defaultSplitPercent: number } =>
				entry.defaultSplitPercent !== null
		);

		if (set.length > 0) {
			const sum = set.reduce((total, entry) => total + entry.defaultSplitPercent, 0);
			if (Math.abs(sum - 100) > SUM_TOLERANCE) {
				throw new InvalidDefaultSplitError(sum);
			}
		}

		await deps.groupMemberRepo.updateDefaultSplitPercents(groupId, entries);
	}

	return { getGroupMembers, getGroupMembersWithStatus, updateDefaultSplitPercents };
}

export type GroupMemberService = ReturnType<typeof createGroupMemberService>;
