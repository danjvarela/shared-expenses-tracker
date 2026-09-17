import { error, redirect } from '@sveltejs/kit';
import { authService } from '$lib/server/container';
import { APP_ENV } from '$lib/server/infra/app-env';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, cookies }) => {
	if (APP_ENV !== 'demo') error(404, 'Not found');

	const form = await request.formData();
	const email = form.get('email');
	const password = form.get('password');
	if (typeof email !== 'string' || typeof password !== 'string') {
		error(400, 'Email and password are required');
	}

	const result = await authService.authenticateWithPassword(email, password);
	if (!result) error(401, 'Invalid email or password');

	const token = authService.generateSessionToken();
	const session = await authService.createSession(token, result.userId);

	cookies.set('session', token, {
		path: '/',
		httpOnly: true,
		secure: !url.hostname.includes('localhost'),
		sameSite: 'lax',
		expires: session.expiresAt
	});

	redirect(302, '/');
};
