import { randomToken, sha256Hex } from '$lib/server/infra/crypto';
import { AppError } from '$lib/server/app/error';
import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import type { IIdentityRepository } from '$lib/server/app/interfaces/repositories/identity';
import type { ISessionRepository } from '$lib/server/app/interfaces/repositories/session';
import type { IOAuthProvider } from '$lib/server/app/interfaces/oauth-provider';
import type { Session } from '$lib/server/domain/session';
import type { User } from '$lib/server/domain/user';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_RENEWAL_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 15;

export class UnknownOAuthProviderError extends AppError {
	constructor() {
		super('Sign-in provider not supported', 500);
	}
}

export class OAuthEmailNotVerifiedError extends AppError {
	constructor() {
		super('Your email is not verified');
	}
}

export interface AuthDeps {
	userRepo: IUserRepository;
	identityRepo: IIdentityRepository;
	sessionRepo: ISessionRepository;
	oauthProviders: Record<string, IOAuthProvider>;
}

export function createAuthService(deps: AuthDeps) {
	function getOAuthProvider(name: string): IOAuthProvider {
		const provider = deps.oauthProviders[name];
		if (!provider) throw new UnknownOAuthProviderError();
		return provider;
	}

	async function createAuthorizationRequest(providerName: string, redirectUri: string) {
		return getOAuthProvider(providerName).createAuthorizationRequest(redirectUri);
	}

	async function handleAuthorizationCallback(
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

		if (!profile.emailVerified) throw new OAuthEmailNotVerifiedError();

		const existingIdentity = await deps.identityRepo.findByProviderSubject(
			profile.provider,
			profile.subject
		);
		if (existingIdentity) return { userId: existingIdentity.userId };

		const existingUser = await deps.userRepo.findByEmail(profile.email);
		if (existingUser) {
			await deps.identityRepo.create({
				userId: existingUser.id,
				provider: profile.provider,
				providerSubject: profile.subject
			});
			if (existingUser.displayName !== profile.name) {
				await deps.userRepo.updateDisplayName(existingUser.id, profile.name);
			}
			return { userId: existingUser.id };
		}

		const newUser = await deps.userRepo.create({
			displayName: profile.name,
			email: profile.email
		});
		await deps.identityRepo.create({
			userId: newUser.id,
			provider: profile.provider,
			providerSubject: profile.subject
		});
		return { userId: newUser.id };
	}

	function generateSessionToken(): string {
		return randomToken();
	}

	async function createSession(token: string, userId: string): Promise<Session> {
		const id = await sha256Hex(token);
		const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
		return deps.sessionRepo.create({ id, userId, expiresAt });
	}

	async function validateSessionToken(
		token: string
	): Promise<{ session: Session; user: User } | null> {
		const id = await sha256Hex(token);
		const result = await deps.sessionRepo.findWithUser(id);
		if (!result) return null;

		const { session, user } = result;

		if (session.expiresAt.getTime() < Date.now()) {
			await deps.sessionRepo.delete(session.id);
			return null;
		}

		if (session.expiresAt.getTime() - Date.now() < SESSION_RENEWAL_THRESHOLD_MS) {
			session.expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
			await deps.sessionRepo.updateExpiresAt(session.id, session.expiresAt);
		}

		return { session, user };
	}

	async function invalidateSession(sessionId: string): Promise<void> {
		await deps.sessionRepo.delete(sessionId);
	}

	return {
		createAuthorizationRequest,
		handleAuthorizationCallback,
		generateSessionToken,
		createSession,
		validateSessionToken,
		invalidateSession
	};
}

export type AuthService = ReturnType<typeof createAuthService>;
