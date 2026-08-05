import { fail, redirect } from '@sveltejs/kit';
import { groupService } from '$lib/server/container';
import { CURRENCIES } from '$lib/currency';
import type { Actions } from './$types';

function trimmedOrNull(value: FormDataEntryValue | null): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		const name = formData.get('name');
		const currencyCode = trimmedOrNull(formData.get('currencyCode'));
		const avatarIcon = trimmedOrNull(formData.get('avatarIcon'));

		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { error: 'Name is required' });
		}
		if (currencyCode !== null && !CURRENCIES.some((currency) => currency.code === currencyCode)) {
			return fail(400, { error: 'Select a valid currency' });
		}

		const created = await groupService.createGroup({
			name: name.trim(),
			currencyCode: currencyCode ?? undefined,
			avatarIcon,
			creatorUserId: locals.user!.id
		});

		redirect(303, `/groups/${created.id}`);
	}
};
