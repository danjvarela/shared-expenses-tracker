import { AppError } from '$lib/server/app/error';
import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';

const DISPLAY_NAME_MAX = 50;

export class InvalidDisplayNameError extends AppError {
	constructor() {
		super('Display name must be 1–50 characters');
	}
}

export interface ProfileInput {
	displayName: string;
}

export function createUserService(deps: { userRepo: IUserRepository }) {
	async function updateProfile(userId: string, input: ProfileInput): Promise<void> {
		const trimmed = input.displayName.trim();
		if (trimmed.length < 1 || trimmed.length > DISPLAY_NAME_MAX) {
			throw new InvalidDisplayNameError();
		}
		await deps.userRepo.updateDisplayName(userId, trimmed);
	}

	return { updateProfile };
}

export type UserService = ReturnType<typeof createUserService>;
