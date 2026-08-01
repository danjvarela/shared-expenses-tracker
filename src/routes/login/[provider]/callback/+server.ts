import { error, redirect } from '@sveltejs/kit';
import {
	handleAuthorizationCallback,
	generateSessionToken,
	createSession
} from '$lib/server/app/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('oauth_state');
	const codeVerifier = cookies.get('oauth_code_verifier');

	cookies.delete('oauth_state', { path: '/' });
	cookies.delete('oauth_code_verifier', { path: '/' });

	if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
		error(400, 'Invalid OAuth callback');
	}

	const redirectUri = `${url.origin}/login/${params.provider}/callback`;
	const { userId } = await handleAuthorizationCallback(
		params.provider,
		code,
		codeVerifier,
		redirectUri
	);

	const token = generateSessionToken();
	const session = await createSession(token, userId);

	cookies.set('session', token, {
		path: '/',
		httpOnly: true,
		secure: !url.hostname.includes('localhost'),
		sameSite: 'lax',
		expires: session.expiresAt
	});

	redirect(302, '/');
};
