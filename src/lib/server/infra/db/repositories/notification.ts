import type { INotificationRepository } from '$lib/server/app/interfaces/repositories/notification';
import type { Database } from '$lib/server/infra/db/types';
import { notification } from '$lib/server/infra/db/schema/notification';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

const create =
	(db: Database): INotificationRepository['create'] =>
	async (input) => {
		const [row] = await db.insert(notification).values(input).returning();

		return row;
	};

const listForUser =
	(db: Database): INotificationRepository['listForUser'] =>
	async (userId) => {
		return await db
			.select()
			.from(notification)
			.where(eq(notification.userId, userId))
			.orderBy(desc(notification.createdAt));
	};

const getUnreadCountForUser =
	(db: Database): INotificationRepository['getUnreadCountForUser'] =>
	async (userId) => {
		const [row] = await db
			.select({ count: count() })
			.from(notification)
			.where(and(eq(notification.userId, userId), isNull(notification.readAt)));

		return row?.count ?? 0;
	};

const markRead =
	(db: Database): INotificationRepository['markRead'] =>
	async (id) => {
		await db.update(notification).set({ readAt: new Date() }).where(eq(notification.id, id));
	};

const markAllReadForUser =
	(db: Database): INotificationRepository['markAllReadForUser'] =>
	async (userId) => {
		await db
			.update(notification)
			.set({ readAt: new Date() })
			.where(and(eq(notification.userId, userId), isNull(notification.readAt)));
	};

export function createNotificationRepository(db: Database): INotificationRepository {
	return {
		create: create(db),
		listForUser: listForUser(db),
		getUnreadCountForUser: getUnreadCountForUser(db),
		markRead: markRead(db),
		markAllReadForUser: markAllReadForUser(db)
	};
}
