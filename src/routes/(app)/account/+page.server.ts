import { fail } from '@sveltejs/kit';
import { userService } from '$lib/server/container';
import { sniffMime } from '$lib/server/app/receipt-format';
import { toActionResult } from '$lib/server/presentation/error-handling';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	return {
		displayName: user.displayName,
		userId: user.id,
		avatarStorageKey: user.avatarStorageKey
	};
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
	},

	updateAvatar: async ({ request, locals }) => {
		const formData = await request.formData();
		const file = formData.get('file');

		if (!(file instanceof File)) {
			return fail(400, { source: 'updateAvatar', message: 'Select an image to upload' });
		}
		if (file.size === 0) {
			return fail(400, { source: 'updateAvatar', message: 'The file is empty' });
		}

		const bytes = new Uint8Array(await file.arrayBuffer());
		const sniffedMime = sniffMime(bytes);

		if (!sniffedMime) {
			return fail(415, { source: 'updateAvatar', message: 'Profile picture must be an image' });
		}

		try {
			await userService.updateAvatar(locals.user!.id, {
				bytes,
				mime: sniffedMime,
				sizeBytes: file.size
			});
		} catch (err) {
			const result = toActionResult(err);
			return fail(result.status, { source: 'updateAvatar', ...result.data });
		}

		return { source: 'updateAvatar', success: true };
	},

	deleteAvatar: async ({ locals }) => {
		try {
			await userService.deleteAvatar(locals.user!.id);
		} catch (err) {
			const result = toActionResult(err);
			return fail(result.status, { source: 'deleteAvatar', ...result.data });
		}

		return { source: 'deleteAvatar', success: true };
	}
};
