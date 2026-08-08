import type { INotificationRepository } from '$lib/server/app/interfaces/repositories/notification';
import type { Notification } from '$lib/server/domain/notification';

export function createNotificationService(deps: { notificationRepo: INotificationRepository }) {
	async function listForUser(userId: string): Promise<Array<Notification>> {
		return deps.notificationRepo.listForUser(userId);
	}

	async function getUnreadCount(userId: string): Promise<number> {
		return deps.notificationRepo.getUnreadCountForUser(userId);
	}

	async function markRead(id: string): Promise<void> {
		await deps.notificationRepo.markRead(id);
	}

	async function markAllRead(userId: string): Promise<void> {
		await deps.notificationRepo.markAllReadForUser(userId);
	}

	function resolveNotificationUrl(notification: Notification): string {
		switch (notification.type) {
			case 'expense_created':
				return `/groups/${notification.groupId}/expenses/${notification.expenseId}`;
			case 'settlement_created':
				return `/groups/${notification.groupId}/settlements/${notification.settlementId}`;
		}
	}

	return { listForUser, getUnreadCount, markRead, markAllRead, resolveNotificationUrl };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
