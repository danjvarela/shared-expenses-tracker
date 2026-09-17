import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
// Relative, not $lib: schema is imported by scripts/seed*.ts, which run standalone
// (esbuild-bundled, no SvelteKit alias resolution) outside the app build.
import { DEFAULT_CURRENCY_CODE } from '../../../../currency';

export const group = sqliteTable('group', {
	id: text()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text().notNull(),
	currencyCode: text().notNull().default(DEFAULT_CURRENCY_CODE),
	avatarIcon: text(),
	createdAt: integer({ mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
