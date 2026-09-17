import { describe, it, expect, vi } from 'vitest';
import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import type { IIdentityRepository } from '$lib/server/app/interfaces/repositories/identity';
import type { ISessionRepository } from '$lib/server/app/interfaces/repositories/session';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IFileStorageBackend } from '$lib/server/app/interfaces/file-storage';
import type { IAvatarNormalizer } from '$lib/server/app/interfaces/avatar-normalizer';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type { User } from '$lib/server/domain/user';
import { createUserService, UserNotFoundError, type AnonymizeRepos } from './user';

const aliceId = 'alice';
const groupA = 'group-a';
const groupB = 'group-b';

function fakeUserRepo(seed: Partial<User> = {}): IUserRepository & {
	anonymizeCalls: string[];
	current: User | null;
} {
	const current: User = {
		id: aliceId,
		displayName: 'Alice',
		email: 'alice@example.com',
		avatarStorageKey: seed.avatarStorageKey ?? null,
		avatarMime: seed.avatarMime ?? null,
		deletedAt: null
	};
	const anonymizeCalls: string[] = [];
	return {
		anonymizeCalls,
		current,
		async findByEmail() {
			return null;
		},
		async getById(userId) {
			return userId === aliceId ? current : null;
		},
		async create() {
			throw new Error('not implemented');
		},
		async updateDisplayName() {},
		async updateAvatar() {},
		async getAllAvatarStorageKeys() {
			return [];
		},
		async anonymize(userId) {
			anonymizeCalls.push(userId);
		}
	};
}

function fakeIdentityRepo(): IIdentityRepository & {
	deleteAllForUserCalls: string[];
} {
	const deleteAllForUserCalls: string[] = [];
	return {
		deleteAllForUserCalls,
		async findByProviderSubject() {
			return null;
		},
		async findByUserIdAndProvider() {
			return null;
		},
		async create() {
			throw new Error('not implemented');
		},
		async hasIdentityForUser() {
			return false;
		},
		async deleteAllForUser(userId) {
			deleteAllForUserCalls.push(userId);
		}
	};
}

function fakeSessionRepo(): ISessionRepository & {
	deleteAllForUserCalls: string[];
} {
	const deleteAllForUserCalls: string[] = [];
	return {
		deleteAllForUserCalls,
		async create() {
			throw new Error('not implemented');
		},
		async findWithUser() {
			return null;
		},
		async updateExpiresAt() {},
		async delete() {},
		async deleteAllForUser(userId) {
			deleteAllForUserCalls.push(userId);
		}
	};
}

function fakeGroupMemberRepo(opts: {
	groupIds: string[];
	counts: Record<string, number>;
}): IGroupMemberRepository & {
	removedCalls: Array<{ groupId: string; userId: string }>;
	getGroupIdsForUserCalls: string[];
} {
	const removedCalls: Array<{ groupId: string; userId: string }> = [];
	const getGroupIdsForUserCalls: string[] = [];
	return {
		removedCalls,
		getGroupIdsForUserCalls,
		async getAllForGroupWithUser() {
			return [];
		},
		async create() {},
		async updateDefaultSplitPercents() {},
		async isMember() {
			return true;
		},
		async countByGroup(groupId) {
			return opts.counts[groupId] ?? 0;
		},
		async remove(groupId, userId) {
			removedCalls.push({ groupId, userId });
		},
		async getGroupIdsForUser(userId) {
			getGroupIdsForUserCalls.push(userId);
			return opts.groupIds;
		}
	};
}

function fakeStorage(): IFileStorageBackend & {
	deletedKeys: string[];
	deleteShouldThrow: boolean;
} {
	const deletedKeys: string[] = [];
	return {
		deletedKeys,
		deleteShouldThrow: false,
		async put() {
			throw new Error('not implemented');
		},
		async getReadUrl() {
			return null;
		},
		async getStream() {
			throw new Error('not implemented');
		},
		async delete(key) {
			if (this.deleteShouldThrow) throw new Error('delete failed');
			deletedKeys.push(key);
		},
		async listKeys() {
			return [];
		}
	};
}

function noopNormalizer(): IAvatarNormalizer {
	return {
		async normalize() {
			throw new Error('not implemented');
		}
	};
}

function makeUow(repos: AnonymizeRepos): IUnitOfWork<AnonymizeRepos> {
	return {
		run<T>(fn: (repos: AnonymizeRepos) => Promise<T>): Promise<T> {
			return fn(repos);
		}
	};
}

function service(
	opts: {
		userRepo?: ReturnType<typeof fakeUserRepo>;
		identityRepo?: ReturnType<typeof fakeIdentityRepo>;
		sessionRepo?: ReturnType<typeof fakeSessionRepo>;
		groupMemberRepo?: ReturnType<typeof fakeGroupMemberRepo>;
		storage?: ReturnType<typeof fakeStorage>;
		seed?: Partial<User>;
		groupIds?: string[];
		counts?: Record<string, number>;
	} = {}
) {
	const userRepo = opts.userRepo ?? fakeUserRepo(opts.seed ?? {});
	const identityRepo = opts.identityRepo ?? fakeIdentityRepo();
	const sessionRepo = opts.sessionRepo ?? fakeSessionRepo();
	const groupMemberRepo =
		opts.groupMemberRepo ??
		fakeGroupMemberRepo({
			groupIds: opts.groupIds ?? [],
			counts: opts.counts ?? {}
		});
	const storage = opts.storage ?? fakeStorage();
	const uow = makeUow({ userRepo, identityRepo, sessionRepo, groupMemberRepo });
	const svc = createUserService({
		userRepo,
		uow,
		storageBackend: storage,
		normalizer: noopNormalizer()
	});
	return { svc, userRepo, identityRepo, sessionRepo, groupMemberRepo, storage, uow };
}

describe('createUserService.anonymizeUser', () => {
	it('throws UserNotFoundError when the user does not exist', async () => {
		const userRepo = fakeUserRepo();
		userRepo.getById = vi.fn(async () => null);
		const { svc } = service({ userRepo });

		await expect(svc.anonymizeUser('unknown')).rejects.toBeInstanceOf(UserNotFoundError);
	});

	it('calls userRepo.anonymize with the userId', async () => {
		const { svc, userRepo } = service();

		await svc.anonymizeUser(aliceId);

		expect(userRepo.anonymizeCalls).toEqual([aliceId]);
	});

	it('hard-deletes all identities for the user', async () => {
		const { svc, identityRepo } = service();

		await svc.anonymizeUser(aliceId);

		expect(identityRepo.deleteAllForUserCalls).toEqual([aliceId]);
	});

	it('hard-deletes all sessions for the user', async () => {
		const { svc, sessionRepo } = service();

		await svc.anonymizeUser(aliceId);

		expect(sessionRepo.deleteAllForUserCalls).toEqual([aliceId]);
	});

	it('removes GroupMember from groups where other members remain', async () => {
		const { svc, groupMemberRepo } = service({
			groupIds: [groupA, groupB],
			counts: { [groupA]: 2, [groupB]: 1 }
		});

		await svc.anonymizeUser(aliceId);

		expect(groupMemberRepo.getGroupIdsForUserCalls).toEqual([aliceId]);
		expect(groupMemberRepo.removedCalls).toEqual([{ groupId: groupA, userId: aliceId }]);
	});

	it('leaves GroupMember intact where the user is the sole member', async () => {
		const { svc, groupMemberRepo } = service({
			groupIds: [groupA, groupB],
			counts: { [groupA]: 2, [groupB]: 1 }
		});

		await svc.anonymizeUser(aliceId);

		expect(groupMemberRepo.removedCalls).not.toContainEqual({
			groupId: groupB,
			userId: aliceId
		});
	});

	it('best-effort deletes the avatar storage key when one exists', async () => {
		const oldKey = 'old-avatar-key';
		const { svc, storage } = service({
			seed: { avatarStorageKey: oldKey, avatarMime: 'image/webp' }
		});

		await svc.anonymizeUser(aliceId);

		expect(storage.deletedKeys).toEqual([oldKey]);
	});

	it('does not attempt avatar delete when no key is set', async () => {
		const { svc, storage } = service();

		await svc.anonymizeUser(aliceId);

		expect(storage.deletedKeys).toHaveLength(0);
	});

	it('completes even when the avatar delete throws', async () => {
		const oldKey = 'old-avatar-key';
		const storage = fakeStorage();
		storage.deleteShouldThrow = true;
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { svc, userRepo } = service({ storage, seed: { avatarStorageKey: oldKey } });

		await svc.anonymizeUser(aliceId);

		expect(userRepo.anonymizeCalls).toEqual([aliceId]);
		consoleSpy.mockRestore();
	});

	it('runs all DB writes inside the uow transaction', async () => {
		const { svc, identityRepo, sessionRepo, userRepo, groupMemberRepo } = service();

		await svc.anonymizeUser(aliceId);

		expect(identityRepo.deleteAllForUserCalls).toEqual([aliceId]);
		expect(sessionRepo.deleteAllForUserCalls).toEqual([aliceId]);
		expect(userRepo.anonymizeCalls).toEqual([aliceId]);
		expect(groupMemberRepo.getGroupIdsForUserCalls).toEqual([aliceId]);
	});
});
