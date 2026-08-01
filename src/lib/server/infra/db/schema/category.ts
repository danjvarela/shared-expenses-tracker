import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const category = sqliteTable('category', {
	id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
	name: text().notNull().unique(),
	icon: text().notNull(),
	createdAt: integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
