import { describe, it, expect } from 'vitest';
import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import type { IIdentityRepository } from '$lib/server/app/interfaces/repositories/identity';
import type { ISessionRepository } from '$lib/server/app/interfaces/repositories/session';
import type { IOAuthProvider, OAuthProfile } from '$lib/server/app/interfaces/oauth-provider';
import type { User } from '$lib/server/domain/user';
import type { Session } from '$lib/server/domain/session';
import { createAuthService } from './auth';

function fakeUserRepo(seed: Array<User> = []): IUserRepository & {
	updatedDisplayNames: Array<{ userId: string; displayName: string }>;
} {
	const rows = new Map(seed.map((row) => [row.id, row]));
	let nextId = seed.length;
	const updatedDisplayNames: Array<{ userId: string; displayName: string }> = [];
	const normalizeEmail = (email: string) => email.trim().toLowerCase();

	return {
		updatedDisplayNames,
		async findByEmail(email) {
			const target = normalizeEmail(email);
			return Array.from(rows.values()).find((row) => row.email === target) ?? null;
		},
		async create(input) {
			const row: User = {
				id: `user-${nextId++}`,
				displayName: input.displayName,
				email: normalizeEmail(input.email)
			};
			rows.set(row.id, row);
			return row;
		},
		async updateDisplayName(userId, displayName) {
			updatedDisplayNames.push({ userId, displayName });
			const row = rows.get(userId);
			if (row) row.displayName = displayName;
		}
	};
}

function fakeIdentityRepo(): IIdentityRepository {
	const rows: Array<{ id: string; userId: string; provider: string; providerSubject: string }> = [];

	return {
		async findByProviderSubject(provider, providerSubject) {
			const row = rows.find(
				(row) => row.provider === provider && row.providerSubject === providerSubject
			);
			return row ? { ...row, createdAt: new Date() } : null;
		},
		async create(input) {
			const row = { id: `identity-${rows.length}`, ...input };
			rows.push(row);
			return { ...row, createdAt: new Date() };
		}
	};
}

function fakeSessionRepo(users: Map<string, User>): ISessionRepository {
	const rows = new Map<string, Session>();

	return {
		async create(input) {
			const session: Session = input;
			rows.set(session.id, session);
			return session;
		},
		async findWithUser(id) {
			const session = rows.get(id);
			if (!session) return null;
			const user = users.get(session.userId);
			if (!user) return null;
			return { session, user };
		},
		async updateExpiresAt(id, expiresAt) {
			const session = rows.get(id);
			if (session) session.expiresAt = expiresAt;
		},
		async delete(id) {
			rows.delete(id);
		}
	};
}

function fakeOAuthProvider(profile: OAuthProfile): IOAuthProvider {
	return {
		provider: profile.provider,
		async createAuthorizationRequest(redirectUri) {
			return {
				url: `https://auth.example/${redirectUri}`,
				state: 'state',
				codeVerifier: 'verifier'
			};
		},
		async handleCallback() {
			return profile;
		}
	};
}

const googleProfile: OAuthProfile = {
	provider: 'google',
	subject: 'google-subject-1',
	email: 'alice@example.com',
	emailVerified: true,
	name: 'Alice'
};

describe('createAuthService', () => {
	it('creates a new user and identity on first login with no existing match', async () => {
		const userRepo = fakeUserRepo();
		const identityRepo = fakeIdentityRepo();
		const service = createAuthService({
			userRepo,
			identityRepo,
			sessionRepo: fakeSessionRepo(new Map()),
			oauthProviders: { google: fakeOAuthProvider(googleProfile) }
		});

		const { userId } = await service.handleAuthorizationCallback(
			'google',
			'code',
			'verifier',
			'https://app.example/callback'
		);

		const identity = await identityRepo.findByProviderSubject('google', googleProfile.subject);
		expect(identity?.userId).toBe(userId);
		const user = await userRepo.findByEmail(googleProfile.email);
		expect(user?.id).toBe(userId);
	});

	it('links to an existing user matched by email instead of duplicating', async () => {
		const existingUser: User = {
			id: 'user-existing',
			displayName: 'Alice',
			email: googleProfile.email
		};
		const service = createAuthService({
			userRepo: fakeUserRepo([existingUser]),
			identityRepo: fakeIdentityRepo(),
			sessionRepo: fakeSessionRepo(new Map()),
			oauthProviders: { google: fakeOAuthProvider(googleProfile) }
		});

		const { userId } = await service.handleAuthorizationCallback(
			'google',
			'code',
			'verifier',
			'https://app.example/callback'
		);

		expect(userId).toBe(existingUser.id);
	});

	it("replaces a pre-login user's email-seeded displayName with the Google name on first login", async () => {
		const existingUser: User = {
			id: 'user-invited',
			displayName: googleProfile.email,
			email: googleProfile.email
		};
		const userRepo = fakeUserRepo([existingUser]);
		const service = createAuthService({
			userRepo,
			identityRepo: fakeIdentityRepo(),
			sessionRepo: fakeSessionRepo(new Map()),
			oauthProviders: { google: fakeOAuthProvider(googleProfile) }
		});

		const { userId } = await service.handleAuthorizationCallback(
			'google',
			'code',
			'verifier',
			'https://app.example/callback'
		);

		expect(userId).toBe(existingUser.id);
		expect(userRepo.updatedDisplayNames).toEqual([
			{ userId: existingUser.id, displayName: googleProfile.name }
		]);
		const user = await userRepo.findByEmail(googleProfile.email);
		expect(user?.displayName).toBe(googleProfile.name);
	});

	it('does not clobber a matching displayName when linking by email', async () => {
		const existingUser: User = {
			id: 'user-existing',
			displayName: googleProfile.name,
			email: googleProfile.email
		};
		const userRepo = fakeUserRepo([existingUser]);
		const service = createAuthService({
			userRepo,
			identityRepo: fakeIdentityRepo(),
			sessionRepo: fakeSessionRepo(new Map()),
			oauthProviders: { google: fakeOAuthProvider(googleProfile) }
		});

		await service.handleAuthorizationCallback(
			'google',
			'code',
			'verifier',
			'https://app.example/callback'
		);

		expect(userRepo.updatedDisplayNames).toEqual([]);
	});

	it('normalizes email case when matching and creating a user', async () => {
		const userRepo = fakeUserRepo();
		const service = createAuthService({
			userRepo,
			identityRepo: fakeIdentityRepo(),
			sessionRepo: fakeSessionRepo(new Map()),
			oauthProviders: {
				google: fakeOAuthProvider({ ...googleProfile, email: 'Alice@Example.com' })
			}
		});

		const { userId } = await service.handleAuthorizationCallback(
			'google',
			'code',
			'verifier',
			'https://app.example/callback'
		);

		const user = await userRepo.findByEmail('alice@example.com');
		expect(user?.id).toBe(userId);
		expect(user?.email).toBe('alice@example.com');
	});

	it('rejects an unverified OAuth email', async () => {
		const service = createAuthService({
			userRepo: fakeUserRepo(),
			identityRepo: fakeIdentityRepo(),
			sessionRepo: fakeSessionRepo(new Map()),
			oauthProviders: {
				google: fakeOAuthProvider({ ...googleProfile, emailVerified: false })
			}
		});

		await expect(
			service.handleAuthorizationCallback(
				'google',
				'code',
				'verifier',
				'https://app.example/callback'
			)
		).rejects.toThrow('Your email is not verified');
	});

	it('rejects a session past its expiry and deletes it', async () => {
		const user: User = { id: 'user-1', displayName: 'Alice', email: googleProfile.email };
		const users = new Map([[user.id, user]]);
		const sessionRepo = fakeSessionRepo(users);
		const service = createAuthService({
			userRepo: fakeUserRepo(),
			identityRepo: fakeIdentityRepo(),
			sessionRepo,
			oauthProviders: {}
		});

		const token = service.generateSessionToken();
		const session = await service.createSession(token, user.id);
		await sessionRepo.updateExpiresAt(session.id, new Date(Date.now() - 1000));

		const result = await service.validateSessionToken(token);
		expect(result).toBeNull();
		expect(await sessionRepo.findWithUser(session.id)).toBeNull();
	});
});
