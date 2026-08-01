import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { expense } from './expense';
import { user } from './user';

export const expenseSplit = sqliteTable('expense_split', {
	id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
	expenseId: text()
		.notNull()
		.references(() => expense.id, { onDelete: 'cascade' }),
	userId: text()
		.notNull()
		.references(() => user.id, { onDelete: 'restrict' }),
	amountCents: integer().notNull(),
	createdAt: integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
