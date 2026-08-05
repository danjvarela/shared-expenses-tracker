import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { DEFAULT_CURRENCY_CODE } from '$lib/currency';

export const group = sqliteTable('group', {
	id: text()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text().notNull(),
	description: text(),
	currencyCode: text().notNull().default(DEFAULT_CURRENCY_CODE),
	avatarIcon: text(),
	createdAt: integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
