import { redirect } from '@sveltejs/kit';
import { authService } from '$lib/server/container';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.session) {
		await authService.invalidateSession(locals.session.id);
	}

	cookies.delete('session', { path: '/' });

	redirect(302, '/');
};
