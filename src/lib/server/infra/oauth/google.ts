import { env } from '$env/dynamic/private';
import {
	OAuthConfigError,
	OAuthTokenExchangeError,
	OAuthUserinfoFetchError
} from '$lib/server/app/interfaces/oauth-provider';
import type { IOAuthProvider, OAuthProfile } from '$lib/server/app/interfaces/oauth-provider';
import { randomToken, sha256Base64url } from '$lib/server/infra/crypto';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function requireEnv(name: string): string {
	const value = env[name];
	if (!value) {
		console.error('OAuth config missing', `${name} is not set`);
		throw new OAuthConfigError();
	}
	return value;
}

async function exchangeCodeForAccessToken(code: string, codeVerifier: string, redirectUri: string) {
	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: requireEnv('GOOGLE_CLIENT_ID'),
			client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
			code,
			code_verifier: codeVerifier,
			grant_type: 'authorization_code',
			redirect_uri: redirectUri
		})
	});

	if (!response.ok) {
		console.error('OAuth token exchange failed', response.status);
		throw new OAuthTokenExchangeError();
	}
	const body = (await response.json()) as { access_token: string };
	return body.access_token;
}

async function fetchProfile(accessToken: string) {
	const response = await fetch(USERINFO_URL, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!response.ok) {
		console.error('OAuth userinfo fetch failed', response.status);
		throw new OAuthUserinfoFetchError();
	}
	return (await response.json()) as {
		sub: string;
		email: string;
		email_verified: boolean;
		name: string;
	};
}

export function createGoogleOAuthProvider(): IOAuthProvider {
	return {
		provider: 'google',

		async createAuthorizationRequest(redirectUri: string) {
			const state = randomToken();
			const codeVerifier = randomToken();
			const codeChallenge = await sha256Base64url(codeVerifier);

			const url = new URL(AUTH_URL);
			url.searchParams.set('client_id', requireEnv('GOOGLE_CLIENT_ID'));
			url.searchParams.set('redirect_uri', redirectUri);
			url.searchParams.set('response_type', 'code');
			url.searchParams.set('scope', 'openid email profile');
			url.searchParams.set('state', state);
			url.searchParams.set('code_challenge', codeChallenge);
			url.searchParams.set('code_challenge_method', 'S256');

			return { url: url.toString(), state, codeVerifier };
		},

		async handleCallback(
			code: string,
			codeVerifier: string,
			redirectUri: string
		): Promise<OAuthProfile> {
			const accessToken = await exchangeCodeForAccessToken(code, codeVerifier, redirectUri);
			const profile = await fetchProfile(accessToken);

			return {
				provider: 'google',
				subject: profile.sub,
				email: profile.email,
				emailVerified: profile.email_verified,
				name: profile.name
			};
		}
	};
}
