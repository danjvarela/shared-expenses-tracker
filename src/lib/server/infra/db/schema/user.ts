import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
	id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
	displayName: text().notNull(),
	email: text().notNull().unique()
});
