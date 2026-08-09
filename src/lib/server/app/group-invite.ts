import * as z from 'zod';
import { AppError } from '$lib/server/app/error';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';

export interface InviteRepos {
	userRepo: IUserRepository;
	groupMemberRepo: IGroupMemberRepository;
}

export type InviteResult =
	{ status: 'invited'; userId: string } | { status: 'already_member'; userId: string };

export class InvalidInviteEmailError extends AppError {
	constructor() {
		super('Enter a valid email address');
	}
}

export function createGroupInviteService(deps: { uow: IUnitOfWork<InviteRepos> }) {
	async function inviteByEmail(groupId: string, rawEmail: string): Promise<InviteResult> {
		const parsed = z.email().safeParse(rawEmail.trim());
		if (!parsed.success) throw new InvalidInviteEmailError();

		const email = parsed.data;

		return deps.uow.run(async ({ userRepo, groupMemberRepo }) => {
			let user = await userRepo.findByEmail(email);
			if (user) {
				if (await groupMemberRepo.isMember(groupId, user.id)) {
					return { status: 'already_member', userId: user.id };
				}
			} else {
				user = await userRepo.create({ displayName: email, email, fromInvite: true });
			}

			await groupMemberRepo.create(groupId, user.id);
			return { status: 'invited', userId: user.id };
		});
	}

	return { inviteByEmail };
}

export type GroupInviteService = ReturnType<typeof createGroupInviteService>;
