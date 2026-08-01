import { findByEmail, create as createUser } from '$lib/server/infra/db/repositories/user';
import {
	findByProviderSubject,
	create as createIdentity
} from '$lib/server/infra/db/repositories/identity';
import {
	create as createSessionRow,
	findWithUser,
	updateExpiresAt,
	deleteSession
} from '$lib/server/infra/db/repositories/session';
import { googleOAuthProvider } from '$lib/server/infra/oauth/google';
import { randomToken, sha256Hex } from '$lib/server/infra/crypto';
import type { IOAuthProvider } from '$lib/server/app/interfaces/oauth-provider';
import type { Session } from '$lib/server/domain/session';
import type { User } from '$lib/server/domain/user';

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

	const existingIdentity = await findByProviderSubject(profile.provider, profile.subject);
	if (existingIdentity) return { userId: existingIdentity.userId };

	const existingUser = await findByEmail(profile.email);
	if (existingUser) {
		await createIdentity({
			userId: existingUser.id,
			provider: profile.provider,
			providerSubject: profile.subject
		});
		return { userId: existingUser.id };
	}

	const newUser = await createUser({ displayName: profile.name, email: profile.email });
	await createIdentity({
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
	return createSessionRow({ id, userId, expiresAt });
}

export async function validateSessionToken(
	token: string
): Promise<{ session: Session; user: User } | null> {
	const id = await sha256Hex(token);
	const result = await findWithUser(id);
	if (!result) return null;

	const { session, user } = result;

	if (session.expiresAt.getTime() < Date.now()) {
		await deleteSession(session.id);
		return null;
	}

	if (session.expiresAt.getTime() - Date.now() < SESSION_RENEWAL_THRESHOLD_MS) {
		session.expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
		await updateExpiresAt(session.id, session.expiresAt);
	}

	return { session, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
	await deleteSession(sessionId);
}
