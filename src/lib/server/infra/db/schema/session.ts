import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { user } from './user';

export const session = sqliteTable('session', {
	id: text().primaryKey(),
	userId: text()
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	expiresAt: integer({ mode: 'timestamp' }).notNull()
});
