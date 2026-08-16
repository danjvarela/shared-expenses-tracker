import type { Notification } from '$lib/server/domain/notification';

export interface NotificationCreateInput {
	userId: string;
	groupId: string;
	type: 'expense_created' | 'settlement_created' | 'member_removed';
	expenseId: string | null;
	settlementId: string | null;
	message: string;
}

export interface INotificationRepository {
	create(input: NotificationCreateInput): Promise<Notification>;

	listForUser(userId: string): Promise<Array<Notification>>;

	getUnreadCountForUser(userId: string): Promise<number>;

	markRead(id: string): Promise<void>;

	markAllReadForUser(userId: string): Promise<void>;
}
