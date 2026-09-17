import { fail, redirect } from '@sveltejs/kit';
import {
	groupService,
	groupMemberService,
	groupInviteService,
	removeMemberService,
	categoryService
} from '$lib/server/container';
import { toActionResult } from '$lib/server/presentation/error-handling';
import { assertDestructiveActionAllowed } from '$lib/server/infra/app-env';
import { CURRENCIES } from '$lib/currency';
import type { PageServerLoad, Actions } from './$types';

function trimmedOrNull(value: FormDataEntryValue | null): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export const load: PageServerLoad = async ({ params, parent }) => {
	const { group } = await parent();

	const members = await groupMemberService.getGroupMembersWithStatus(params.id);
	const hasOutstandingBalance = await groupService.hasOutstandingBalance(params.id);
	const categories = await categoryService.getForGroup(params.id);

	return { group, members, hasOutstandingBalance, categories };
};

export const actions: Actions = {
	details: async ({ request, params }) => {
		const formData = await request.formData();

		const name = formData.get('name');
		const currencyCode = trimmedOrNull(formData.get('currencyCode'));
		const avatarIcon = trimmedOrNull(formData.get('avatarIcon'));

		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { error: 'Name is required' });
		}
		if (currencyCode === null || !CURRENCIES.some((currency) => currency.code === currencyCode)) {
			return fail(400, { error: 'Select a valid currency' });
		}

		await groupService.updateGroup({
			id: params.id,
			name: name.trim(),
			currencyCode,
			avatarIcon
		});

		return { success: true };
	},

	percents: async ({ request, params }) => {
		const members = await groupMemberService.getGroupMembers(params.id);
		const formData = await request.formData();

		const entries = members.map((member) => {
			const raw = formData.get(`percent-${member.userId}`);
			const trimmed = typeof raw === 'string' ? raw.trim() : '';
			return {
				userId: member.userId,
				defaultSplitPercent: trimmed === '' ? null : Number(trimmed)
			};
		});

		if (
			entries.some(
				(entry) => entry.defaultSplitPercent !== null && Number.isNaN(entry.defaultSplitPercent)
			)
		) {
			return fail(400, { source: 'percents', message: 'Percentages must be numbers' });
		}

		try {
			await groupMemberService.updateDefaultSplitPercents(params.id, entries);
		} catch (err) {
			const actionResult = toActionResult(err);
			return fail(actionResult.status, { source: 'percents', ...actionResult.data });
		}

		return { success: true };
	},

	invite: async ({ request, params }) => {
		const formData = await request.formData();
		const email = formData.get('email');

		if (typeof email !== 'string' || email.trim() === '') {
			return fail(400, { source: 'invite', message: 'Enter an email address' });
		}

		let result;
		try {
			result = await groupInviteService.inviteByEmail(params.id, email.trim());
		} catch (err) {
			const actionResult = toActionResult(err);
			return fail(actionResult.status, { source: 'invite', ...actionResult.data });
		}

		return { invite: { status: result.status, email: email.trim() } };
	},

	addCategory: async ({ request, params }) => {
		const formData = await request.formData();
		const name = formData.get('name');
		const icon = formData.get('icon');

		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { source: 'addCategory', message: 'Enter a category name' });
		}
		if (typeof icon !== 'string' || icon.trim() === '') {
			return fail(400, { source: 'addCategory', message: 'Enter an icon' });
		}

		try {
			await categoryService.addCustomCategory(params.id, name.trim(), icon.trim());
		} catch (err) {
			const actionResult = toActionResult(err);
			return fail(actionResult.status, { source: 'addCategory', ...actionResult.data });
		}

		return { source: 'addCategory', success: true };
	},

	editCategory: async ({ request, params }) => {
		const formData = await request.formData();
		const categoryId = formData.get('categoryId');
		const name = formData.get('name');
		const icon = formData.get('icon');

		if (typeof categoryId !== 'string' || categoryId.trim() === '') {
			return fail(400, { source: 'editCategory', message: 'Invalid category' });
		}
		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { source: 'editCategory', message: 'Enter a category name' });
		}
		if (typeof icon !== 'string' || icon.trim() === '') {
			return fail(400, { source: 'editCategory', message: 'Enter an icon' });
		}

		try {
			await categoryService.editCategory(params.id, categoryId, name.trim(), icon.trim());
		} catch (err) {
			const actionResult = toActionResult(err);
			return fail(actionResult.status, { source: 'editCategory', ...actionResult.data });
		}

		return { source: 'editCategory', success: true };
	},

	removeCategory: async ({ request, params }) => {
		const formData = await request.formData();
		const categoryId = formData.get('categoryId');

		if (typeof categoryId !== 'string' || categoryId.trim() === '') {
			return fail(400, { source: 'removeCategory', message: 'Invalid category' });
		}

		try {
			await categoryService.removeCategory(params.id, categoryId);
		} catch (err) {
			const actionResult = toActionResult(err);
			return fail(actionResult.status, { source: 'removeCategory', ...actionResult.data });
		}

		return { source: 'removeCategory', success: true };
	},

	delete: async ({ params }) => {
		assertDestructiveActionAllowed();

		try {
			await groupService.deleteGroup(params.id);
		} catch (err) {
			const actionResult = toActionResult(err);
			return fail(actionResult.status, { source: 'delete', ...actionResult.data });
		}

		redirect(303, '/');
	},

	remove: async ({ request, params, locals }) => {
		assertDestructiveActionAllowed();

		const formData = await request.formData();
		const userId = formData.get('userId');

		if (typeof userId !== 'string' || userId.trim() === '') {
			return fail(400, { source: 'remove', message: 'Invalid user' });
		}

		const removerId = locals.user!.id;

		try {
			await removeMemberService.kickUser(params.id, userId, removerId);
			return { success: true };
		} catch (err) {
			const result = toActionResult(err);
			return fail(result.status, { source: 'remove', ...result.data });
		}
	},

	leave: async ({ params, locals }) => {
		assertDestructiveActionAllowed();

		const userId = locals.user!.id;

		try {
			await removeMemberService.kickUser(params.id, userId, userId);
		} catch (err) {
			const result = toActionResult(err);
			return fail(result.status, { source: 'leave', ...result.data });
		}

		redirect(303, '/');
	}
};
