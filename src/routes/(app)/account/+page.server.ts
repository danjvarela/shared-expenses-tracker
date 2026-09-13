import { fail } from '@sveltejs/kit';
import { userService } from '$lib/server/container';
import { toActionResult } from '$lib/server/presentation/error-handling';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return { displayName: locals.user!.displayName };
};

export const actions: Actions = {
	updateProfile: async ({ request, locals }) => {
		const formData = await request.formData();
		const displayName = formData.get('displayName');

		if (typeof displayName !== 'string') {
			return fail(400, { source: 'updateProfile', message: 'Enter a display name' });
		}

		try {
			await userService.updateProfile(locals.user!.id, { displayName });
		} catch (err) {
			const result = toActionResult(err);
			return fail(result.status, { source: 'updateProfile', ...result.data });
		}

		return { source: 'updateProfile', success: true };
	}
};
