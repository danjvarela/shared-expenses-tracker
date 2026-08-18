import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { expense } from './expense';
import { user } from './user';

export const expenseReceipt = sqliteTable('expense_receipt', {
	id: text()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	expenseId: text()
		.notNull()
		.references(() => expense.id, { onDelete: 'cascade' }),
	storageKey: text().notNull(),
	mime: text().notNull(),
	sizeBytes: integer().notNull(),
	originalFilename: text(),
	uploadedByUserId: text()
		.notNull()
		.references(() => user.id, { onDelete: 'restrict' }),
	uploadedAt: integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
