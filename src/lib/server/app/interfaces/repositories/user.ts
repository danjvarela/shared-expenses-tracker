import type { User } from '$lib/server/domain/user';

export interface IUserRepository {
	findByEmail(email: string): Promise<User | null>;
	create(input: { displayName: string; email: string, fromInvite?: boolean }): Promise<User>;
	updateDisplayName(userId: string, displayName: string): Promise<void>;
}
