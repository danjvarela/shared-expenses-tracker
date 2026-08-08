import { describe, it, expect } from 'vitest';
import type {
	INotificationRepository,
	NotificationCreateInput
} from '$lib/server/app/interfaces/repositories/notification';
import type { Notification } from '$lib/server/domain/notification';
import { createNotificationService } from './notification';

function fakeNotificationRepo(seed: Array<Notification> = []): INotificationRepository {
	const rows = new Map(seed.map((row) => [row.id, row]));

	return {
		async create(input: NotificationCreateInput) {
			const row: Notification = {
				...input,
				id: `notification-${rows.size}`,
				readAt: null,
				createdAt: new Date()
			};
			rows.set(row.id, row);
			return row;
		},
		async listForUser(userId) {
			return Array.from(rows.values()).filter((row) => row.userId === userId);
		},
		async getUnreadCountForUser(userId) {
			return Array.from(rows.values()).filter((row) => row.userId === userId && !row.readAt).length;
		},
		async markRead(id) {
			const existing = rows.get(id);
			if (existing) rows.set(id, { ...existing, readAt: new Date() });
		},
		async markAllReadForUser(userId) {
			for (const row of rows.values()) {
				if (row.userId === userId && !row.readAt) {
					rows.set(row.id, { ...row, readAt: new Date() });
				}
			}
		}
	};
}

describe('createNotificationService', () => {
	it('lists notifications and counts unread ones for a user', async () => {
		const notificationRepo = fakeNotificationRepo();
		const service = createNotificationService({ notificationRepo });

		await notificationRepo.create({
			userId: 'alice',
			groupId: 'group-1',
			type: 'expense_created',
			expenseId: 'expense-1',
			settlementId: null,
			message: 'Bob added Dinner ($10.00)'
		});

		expect(await service.getUnreadCount('alice')).toBe(1);
		expect(await service.listForUser('alice')).toHaveLength(1);
		expect(await service.listForUser('bob')).toEqual([]);
	});

	it('marks a single notification read', async () => {
		const notificationRepo = fakeNotificationRepo();
		const service = createNotificationService({ notificationRepo });

		const created = await notificationRepo.create({
			userId: 'alice',
			groupId: 'group-1',
			type: 'expense_created',
			expenseId: 'expense-1',
			settlementId: null,
			message: 'Bob added Dinner ($10.00)'
		});

		await service.markRead(created.id);

		expect(await service.getUnreadCount('alice')).toBe(0);
	});

	it('marks all notifications read for a user', async () => {
		const notificationRepo = fakeNotificationRepo();
		const service = createNotificationService({ notificationRepo });

		await notificationRepo.create({
			userId: 'alice',
			groupId: 'group-1',
			type: 'expense_created',
			expenseId: 'expense-1',
			settlementId: null,
			message: 'first'
		});
		await notificationRepo.create({
			userId: 'alice',
			groupId: 'group-1',
			type: 'expense_created',
			expenseId: 'expense-2',
			settlementId: null,
			message: 'second'
		});

		await service.markAllRead('alice');

		expect(await service.getUnreadCount('alice')).toBe(0);
	});
});
