import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { Group } from '$lib/server/domain/group';
import { DEFAULT_CURRENCY_CODE } from '$lib/currency';

export interface GroupInput {
	name: string;
	currencyCode: string | undefined;
	avatarIcon: string | null;
	creatorUserId: string;
}

export interface GroupUpdateInput {
	id: string;
	name: string;
	currencyCode: string;
	avatarIcon: string | null;
}

export interface GroupRepos {
	groupRepo: IGroupRepository;
	groupMemberRepo: IGroupMemberRepository;
}

export function createGroupService(deps: {
	uow: IUnitOfWork<GroupRepos>;
	groupRepo: IGroupRepository;
}) {
	async function createGroup(input: GroupInput): Promise<Group> {
		return deps.uow.run(async ({ groupRepo, groupMemberRepo }) => {
			const created = await groupRepo.create({
				name: input.name,
				currencyCode: input.currencyCode ?? DEFAULT_CURRENCY_CODE,
				avatarIcon: input.avatarIcon
			});

			await groupMemberRepo.create(created.id, input.creatorUserId);

			return created;
		});
	}

	async function updateGroup(input: GroupUpdateInput): Promise<Group> {
		return deps.groupRepo.update(input.id, {
			name: input.name,
			currencyCode: input.currencyCode,
			avatarIcon: input.avatarIcon
		});
	}

	return { createGroup, updateGroup };
}

export type GroupService = ReturnType<typeof createGroupService>;
