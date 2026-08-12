import { describe, it, expect } from 'vitest';
import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type { User } from '$lib/server/domain/user';
import {
	createGroupInviteService,
	InvalidInviteEmailError,
	type InviteRepos
} from './group-invite';

const groupId = 'group-1';

function fakeUserRepo(seed: Array<User> = []): IUserRepository & {
	created: Array<{ displayName: string; email: string }>;
} {
	const rows = new Map(seed.map((row) => [row.id, row]));
	const created: Array<{ displayName: string; email: string }> = [];
	const normalizeEmail = (email: string) => email.trim().toLowerCase();
	return {
		created,
		async findByEmail(email) {
			const target = normalizeEmail(email);
			return Array.from(rows.values()).find((row) => row.email === target) ?? null;
		},
		async create(input) {
			const email = normalizeEmail(input.email);
			const displayName = input.fromInvite ? normalizeEmail(input.displayName) : input.displayName;
			const row: User = { id: `user-${rows.size}`, displayName, email };
			rows.set(row.id, row);
			created.push({ displayName, email });
			return row;
		},
		async updateDisplayName() {}
	};
}

function fakeGroupMemberRepo(members: Set<string>): IGroupMemberRepository & {
	created: Array<{ groupId: string; userId: string }>;
} {
	const created: Array<{ groupId: string; userId: string }> = [];
	return {
		created,
		async getAllForGroupWithUser() {
			return [];
		},
		async create(gid, userId) {
			members.add(userId);
			created.push({ groupId: gid, userId });
		},
		async updateDefaultSplitPercents() {},
		async isMember(_gid, userId) {
			return members.has(userId);
		},
		async countByGroup() {
			return members.size;
		},
		async remove(_gid, userId) {
			members.delete(userId);
		}
	};
}

function fakeUow(repos: InviteRepos): IUnitOfWork<InviteRepos> {
	return {
		async run(fn) {
			return fn(repos);
		}
	};
}

describe('createGroupInviteService', () => {
	it('creates a pre-login user and adds them as a member for an unknown email', async () => {
		const userRepo = fakeUserRepo();
		const groupMemberRepo = fakeGroupMemberRepo(new Set());
		const service = createGroupInviteService({ uow: fakeUow({ userRepo, groupMemberRepo }) });

		const result = await service.inviteByEmail(groupId, 'carol@example.com');

		expect(result.status).toBe('invited');
		expect(userRepo.created).toEqual([
			{ displayName: 'carol@example.com', email: 'carol@example.com' }
		]);
		expect(groupMemberRepo.created).toEqual([{ groupId, userId: result.userId }]);
	});

	it('adds an existing user as a member without creating a new user', async () => {
		const existing: User = { id: 'user-dave', displayName: 'Dave', email: 'dave@example.com' };
		const userRepo = fakeUserRepo([existing]);
		const groupMemberRepo = fakeGroupMemberRepo(new Set());
		const service = createGroupInviteService({ uow: fakeUow({ userRepo, groupMemberRepo }) });

		const result = await service.inviteByEmail(groupId, 'dave@example.com');

		expect(result).toEqual({ status: 'invited', userId: 'user-dave' });
		expect(userRepo.created).toEqual([]);
		expect(groupMemberRepo.created).toEqual([{ groupId, userId: 'user-dave' }]);
	});

	it('is a no-op and reports already-a-member when the user is already in the group', async () => {
		const existing: User = { id: 'user-dave', displayName: 'Dave', email: 'dave@example.com' };
		const userRepo = fakeUserRepo([existing]);
		const groupMemberRepo = fakeGroupMemberRepo(new Set(['user-dave']));
		const service = createGroupInviteService({ uow: fakeUow({ userRepo, groupMemberRepo }) });

		const result = await service.inviteByEmail(groupId, 'dave@example.com');

		expect(result).toEqual({ status: 'already_member', userId: 'user-dave' });
		expect(groupMemberRepo.created).toEqual([]);
	});

	it('treats the inviter inviting themselves as already-a-member', async () => {
		const inviter: User = { id: 'alice', displayName: 'Alice', email: 'alice@example.com' };
		const userRepo = fakeUserRepo([inviter]);
		const groupMemberRepo = fakeGroupMemberRepo(new Set(['alice']));
		const service = createGroupInviteService({ uow: fakeUow({ userRepo, groupMemberRepo }) });

		const result = await service.inviteByEmail(groupId, 'alice@example.com');

		expect(result).toEqual({ status: 'already_member', userId: 'alice' });
		expect(groupMemberRepo.created).toEqual([]);
	});

	it('rejects an invalid email format', async () => {
		const userRepo = fakeUserRepo();
		const groupMemberRepo = fakeGroupMemberRepo(new Set());
		const service = createGroupInviteService({ uow: fakeUow({ userRepo, groupMemberRepo }) });

		await expect(service.inviteByEmail(groupId, 'not-an-email')).rejects.toBeInstanceOf(
			InvalidInviteEmailError
		);
		expect(userRepo.created).toEqual([]);
		expect(groupMemberRepo.created).toEqual([]);
	});

	it('normalizes email case before lookup and insert', async () => {
		const userRepo = fakeUserRepo();
		const groupMemberRepo = fakeGroupMemberRepo(new Set());
		const service = createGroupInviteService({ uow: fakeUow({ userRepo, groupMemberRepo }) });

		const result = await service.inviteByEmail(groupId, 'Carol@Example.com');

		expect(result.status).toBe('invited');
		expect(userRepo.created).toEqual([
			{ displayName: 'carol@example.com', email: 'carol@example.com' }
		]);
	});
});
