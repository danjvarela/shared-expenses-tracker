import { describe, it, expect } from 'vitest';
import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import type { IFileStorageBackend } from '$lib/server/app/interfaces/file-storage';
import type { IAvatarNormalizer } from '$lib/server/app/interfaces/avatar-normalizer';
import { createUserService, InvalidDisplayNameError } from './user';

function noopStorage(): IFileStorageBackend {
	return {
		async put() {
			throw new Error('not implemented');
		},
		async getReadUrl() {
			return null;
		},
		async getStream() {
			throw new Error('not implemented');
		},
		async delete() {},
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

function fakeUserRepo(): IUserRepository & {
	updatedDisplayName: Array<{ userId: string; displayName: string }>;
} {
	const updatedDisplayName: Array<{ userId: string; displayName: string }> = [];
	return {
		updatedDisplayName,
		async findByEmail() {
			return null;
		},
		async getById() {
			return null;
		},
		async create() {
			throw new Error('not implemented');
		},
		async updateDisplayName(userId, displayName) {
			updatedDisplayName.push({ userId, displayName });
		},
		async updateAvatar() {}
	};
}

describe('createUserService', () => {
	describe('updateProfile', () => {
		it('trims and persists a valid display name', async () => {
			const userRepo = fakeUserRepo();
			const service = createUserService({
				userRepo,
				storageBackend: noopStorage(),
				normalizer: noopNormalizer()
			});

			await service.updateProfile('alice', { displayName: '  Alice  ' });

			expect(userRepo.updatedDisplayName).toEqual([{ userId: 'alice', displayName: 'Alice' }]);
		});

		it('accepts a single-character display name', async () => {
			const userRepo = fakeUserRepo();
			const service = createUserService({
				userRepo,
				storageBackend: noopStorage(),
				normalizer: noopNormalizer()
			});

			await service.updateProfile('alice', { displayName: 'A' });

			expect(userRepo.updatedDisplayName).toEqual([{ userId: 'alice', displayName: 'A' }]);
		});

		it('accepts a 50-character display name', async () => {
			const userRepo = fakeUserRepo();
			const service = createUserService({
				userRepo,
				storageBackend: noopStorage(),
				normalizer: noopNormalizer()
			});
			const name = 'a'.repeat(50);

			await service.updateProfile('alice', { displayName: name });

			expect(userRepo.updatedDisplayName).toEqual([{ userId: 'alice', displayName: name }]);
		});

		it('rejects an empty display name', async () => {
			const userRepo = fakeUserRepo();
			const service = createUserService({
				userRepo,
				storageBackend: noopStorage(),
				normalizer: noopNormalizer()
			});

			await expect(service.updateProfile('alice', { displayName: '' })).rejects.toBeInstanceOf(
				InvalidDisplayNameError
			);
			await expect(service.updateProfile('alice', { displayName: '   ' })).rejects.toBeInstanceOf(
				InvalidDisplayNameError
			);
			expect(userRepo.updatedDisplayName).toEqual([]);
		});

		it('rejects a display name longer than 50 characters', async () => {
			const userRepo = fakeUserRepo();
			const service = createUserService({
				userRepo,
				storageBackend: noopStorage(),
				normalizer: noopNormalizer()
			});

			await expect(
				service.updateProfile('alice', { displayName: 'a'.repeat(51) })
			).rejects.toBeInstanceOf(InvalidDisplayNameError);
			expect(userRepo.updatedDisplayName).toEqual([]);
		});

		it('rejects a name that is non-empty before trim but empty after trim', async () => {
			const userRepo = fakeUserRepo();
			const service = createUserService({
				userRepo,
				storageBackend: noopStorage(),
				normalizer: noopNormalizer()
			});

			await expect(service.updateProfile('alice', { displayName: '\t \n' })).rejects.toBeInstanceOf(
				InvalidDisplayNameError
			);
			expect(userRepo.updatedDisplayName).toEqual([]);
		});

		it('surfaces a user-friendly message and 400 status', () => {
			const err = new InvalidDisplayNameError();
			expect(err.status).toBe(400);
			expect(err.message).toBe('Display name must be 1–50 characters');
		});
	});
});
