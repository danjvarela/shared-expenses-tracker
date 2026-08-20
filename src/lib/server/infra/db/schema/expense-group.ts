import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { group } from './group';

export const expenseGroup = sqliteTable('expense_group', {
	id: text()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	groupId: text()
		.notNull()
		.references(() => group.id, { onDelete: 'cascade' }),
	createdAt: integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
