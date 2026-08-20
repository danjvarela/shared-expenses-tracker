import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { expenseGroup } from './expense-group';
import { user } from './user';

export const expenseReceipt = sqliteTable('expense_receipt', {
	id: text()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	expenseGroupId: text()
		.notNull()
		.references(() => expenseGroup.id, { onDelete: 'cascade' }),
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
