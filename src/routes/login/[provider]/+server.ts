import { redirect } from '@sveltejs/kit';
import { createAuthorizationRequest } from '$lib/server/app/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const redirectUri = `${url.origin}/login/${params.provider}/callback`;
	const { url: authorizationUrl, state, codeVerifier } = await createAuthorizationRequest(
		params.provider,
		redirectUri
	);

	const cookieOptions = {
		path: '/',
		httpOnly: true,
		secure: !url.hostname.includes('localhost'),
		sameSite: 'lax' as const,
		maxAge: 60 * 10
	};

	cookies.set('oauth_state', state, cookieOptions);
	cookies.set('oauth_code_verifier', codeVerifier, cookieOptions);

	redirect(302, authorizationUrl);
};
