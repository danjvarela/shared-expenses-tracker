import { error, redirect } from '@sveltejs/kit';
import { notificationService } from '$lib/server/container';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const notifications = await notificationService.listForUser(locals.user!.id);

	return { notifications };
};

export const actions: Actions = {
	open: async ({ request, locals }) => {
		const formData = await request.formData();
		const notificationId = formData.get('notificationId');
		if (typeof notificationId !== 'string') {
			error(400, 'Missing notification id');
		}

		const notifications = await notificationService.listForUser(locals.user!.id);
		const notification = notifications.find((item) => item.id === notificationId);
		if (!notification) {
			error(404, 'Notification not found');
		}

		await notificationService.markRead(notificationId);

		redirect(303, notificationService.resolveNotificationUrl(notification));
	},

	readAll: async ({ locals }) => {
		await notificationService.markAllRead(locals.user!.id);
	}
};
