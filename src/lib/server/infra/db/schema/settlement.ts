import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { group } from './group';
import { user } from './user';

export const settlement = sqliteTable('settlement', {
	id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
	groupId: text()
		.notNull()
		.references(() => group.id, { onDelete: 'cascade' }),
	fromUserId: text()
		.notNull()
		.references(() => user.id, { onDelete: 'restrict' }),
	toUserId: text()
		.notNull()
		.references(() => user.id, { onDelete: 'restrict' }),
	amountCents: integer().notNull(),
	createdAt: integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
