import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { group } from './group';
import { user } from './user';
import { category } from './category';

export const expense = sqliteTable('expense', {
	id: text()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	groupId: text()
		.notNull()
		.references(() => group.id, { onDelete: 'cascade' }),
	paidByUserId: text()
		.notNull()
		.references(() => user.id, { onDelete: 'restrict' }),
	categoryId: text().references(() => category.id, { onDelete: 'set null' }),
	description: text().notNull(),
	amountCents: integer().notNull(),
	date: integer({ mode: 'timestamp' }).notNull(),
	createdAt: integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
