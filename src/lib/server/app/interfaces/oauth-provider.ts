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
