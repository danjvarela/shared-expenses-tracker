import { notificationService, scannerEnabled } from '$lib/server/container';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const unreadCount = await notificationService.getUnreadCount(locals.user!.id);

	return { user: locals.user!, unreadCount, scannerEnabled };
};
