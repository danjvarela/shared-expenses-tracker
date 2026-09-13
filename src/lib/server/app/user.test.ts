import { describe, it, expect } from 'vitest';
import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import { createUserService, InvalidDisplayNameError } from './user';

function fakeUserRepo(): IUserRepository & {
	updatedDisplayName: Array<{ userId: string; displayName: string }>;
} {
	const updatedDisplayName: Array<{ userId: string; displayName: string }> = [];
	return {
		updatedDisplayName,
		async findByEmail() {
			return null;
		},
		async create() {
			throw new Error('not implemented');
		},
		async updateDisplayName(userId, displayName) {
			updatedDisplayName.push({ userId, displayName });
		}
	};
}

describe('createUserService', () => {
	describe('updateProfile', () => {
		it('trims and persists a valid display name', async () => {
			const userRepo = fakeUserRepo();
			const service = createUserService({ userRepo });

			await service.updateProfile('alice', { displayName: '  Alice  ' });

			expect(userRepo.updatedDisplayName).toEqual([{ userId: 'alice', displayName: 'Alice' }]);
		});

		it('accepts a single-character display name', async () => {
			const userRepo = fakeUserRepo();
			const service = createUserService({ userRepo });

			await service.updateProfile('alice', { displayName: 'A' });

			expect(userRepo.updatedDisplayName).toEqual([{ userId: 'alice', displayName: 'A' }]);
		});

		it('accepts a 50-character display name', async () => {
			const userRepo = fakeUserRepo();
			const service = createUserService({ userRepo });
			const name = 'a'.repeat(50);

			await service.updateProfile('alice', { displayName: name });

			expect(userRepo.updatedDisplayName).toEqual([{ userId: 'alice', displayName: name }]);
		});

		it('rejects an empty display name', async () => {
			const userRepo = fakeUserRepo();
			const service = createUserService({ userRepo });

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
			const service = createUserService({ userRepo });

			await expect(
				service.updateProfile('alice', { displayName: 'a'.repeat(51) })
			).rejects.toBeInstanceOf(InvalidDisplayNameError);
			expect(userRepo.updatedDisplayName).toEqual([]);
		});

		it('rejects a name that is non-empty before trim but empty after trim', async () => {
			const userRepo = fakeUserRepo();
			const service = createUserService({ userRepo });

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
