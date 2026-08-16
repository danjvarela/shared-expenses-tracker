import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { group } from './group';
import { user } from './user';
import { expense } from './expense';
import { settlement } from './settlement';

export const notification = sqliteTable('notification', {
	id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
	userId: text()
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	groupId: text()
		.notNull()
		.references(() => group.id, { onDelete: 'cascade' }),
	type: text({ enum: ['expense_created', 'settlement_created', 'member_removed'] }).notNull(),
	expenseId: text().references(() => expense.id, { onDelete: 'cascade' }),
	settlementId: text().references(() => settlement.id, { onDelete: 'cascade' }),
	message: text().notNull(),
	readAt: integer({ mode: 'timestamp' }),
	createdAt: integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
