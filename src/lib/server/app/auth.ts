import { db } from '$lib/server/infra/db';
import { createUserRepository } from '$lib/server/infra/db/repositories/user';
import { createIdentityRepository } from '$lib/server/infra/db/repositories/identity';
import { createSessionRepository } from '$lib/server/infra/db/repositories/session';
import { createGoogleOAuthProvider } from '$lib/server/infra/oauth/google';
import { randomToken, sha256Hex } from '$lib/server/infra/crypto';
import type { IOAuthProvider } from '$lib/server/app/interfaces/oauth-provider';
import type { Session } from '$lib/server/domain/session';
import type { User } from '$lib/server/domain/user';

const userRepo = createUserRepository(db);
const identityRepo = createIdentityRepository(db);
const sessionRepo = createSessionRepository(db);

const googleOAuthProvider = createGoogleOAuthProvider();
const oauthProviders: Record<string, IOAuthProvider> = {
	[googleOAuthProvider.provider]: googleOAuthProvider
};

function getOAuthProvider(name: string): IOAuthProvider {
	const provider = oauthProviders[name];
	if (!provider) throw new Error(`Unknown OAuth provider: ${name}`);
	return provider;
}

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_RENEWAL_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 15;

export async function createAuthorizationRequest(providerName: string, redirectUri: string) {
	return getOAuthProvider(providerName).createAuthorizationRequest(redirectUri);
}

export async function handleAuthorizationCallback(
	providerName: string,
	code: string,
	codeVerifier: string,
	redirectUri: string
): Promise<{ userId: string }> {
	const profile = await getOAuthProvider(providerName).handleCallback(
		code,
		codeVerifier,
		redirectUri
	);

	if (!profile.emailVerified) throw new Error('OAuth email is not verified');

	const existingIdentity = await identityRepo.findByProviderSubject(
		profile.provider,
		profile.subject
	);
	if (existingIdentity) return { userId: existingIdentity.userId };

	const existingUser = await userRepo.findByEmail(profile.email);
	if (existingUser) {
		await identityRepo.create({
			userId: existingUser.id,
			provider: profile.provider,
			providerSubject: profile.subject
		});
		return { userId: existingUser.id };
	}

	const newUser = await userRepo.create({ displayName: profile.name, email: profile.email });
	await identityRepo.create({
		userId: newUser.id,
		provider: profile.provider,
		providerSubject: profile.subject
	});
	return { userId: newUser.id };
}

export function generateSessionToken(): string {
	return randomToken();
}

export async function createSession(token: string, userId: string): Promise<Session> {
	const id = await sha256Hex(token);
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
	return sessionRepo.create({ id, userId, expiresAt });
}

export async function validateSessionToken(
	token: string
): Promise<{ session: Session; user: User } | null> {
	const id = await sha256Hex(token);
	const result = await sessionRepo.findWithUser(id);
	if (!result) return null;

	const { session, user } = result;

	if (session.expiresAt.getTime() < Date.now()) {
		await sessionRepo.delete(session.id);
		return null;
	}

	if (session.expiresAt.getTime() - Date.now() < SESSION_RENEWAL_THRESHOLD_MS) {
		session.expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
		await sessionRepo.updateExpiresAt(session.id, session.expiresAt);
	}

	return { session, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
	await sessionRepo.delete(sessionId);
}
