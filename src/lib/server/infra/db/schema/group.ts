import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const group = sqliteTable('group', {
	id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
	name: text().notNull(),
	createdAt: integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
