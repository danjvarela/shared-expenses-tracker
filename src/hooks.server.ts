import { redirect, type Handle } from '@sveltejs/kit';
import { authService } from '$lib/server/container';

const PUBLIC_ROUTES = new Set([
	'/login',
	'/login/[provider]',
	'/login/[provider]/callback',
	'/logout'
]);

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('session');

	if (!token) {
		event.locals.user = null;
		event.locals.session = null;
	} else {
		const result = await authService.validateSessionToken(token);

		if (!result) {
			event.cookies.delete('session', { path: '/' });
			event.locals.user = null;
			event.locals.session = null;
		} else {
			event.locals.user = result.user;
			event.locals.session = result.session;
		}
	}

	if (!event.locals.user && !PUBLIC_ROUTES.has(event.route.id ?? '')) {
		redirect(302, '/login');
	}

	return resolve(event);
};
