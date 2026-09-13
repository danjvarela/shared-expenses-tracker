import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
	id: text()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	displayName: text().notNull(),
	email: text().unique(),
	avatarStorageKey: text(),
	avatarMime: text(),
	deletedAt: integer({ mode: 'timestamp' })
});
