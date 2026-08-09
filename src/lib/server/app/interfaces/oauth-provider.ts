import { AppError } from '$lib/server/app/error';

export interface OAuthProfile {
	provider: string;
	subject: string;
	email: string;
	emailVerified: boolean;
	name: string;
}

export interface IOAuthProvider {
	provider: string;
	createAuthorizationRequest(
		redirectUri: string
	): Promise<{ url: string; state: string; codeVerifier: string }>;
	handleCallback(code: string, codeVerifier: string, redirectUri: string): Promise<OAuthProfile>;
}

export class OAuthConfigError extends AppError {
	constructor() {
		super('Sign-in is not available right now', 500);
	}
}

export class OAuthTokenExchangeError extends AppError {
	constructor() {
		super('Sign-in failed, please try again', 502);
	}
}

export class OAuthUserinfoFetchError extends AppError {
	constructor() {
		super('Sign-in failed, please try again', 502);
	}
}
