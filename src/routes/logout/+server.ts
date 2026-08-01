import { redirect } from '@sveltejs/kit';
import { invalidateSession } from '$lib/server/app/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.session) {
		await invalidateSession(locals.session.id);
	}

	cookies.delete('session', { path: '/' });

	redirect(302, '/');
};
