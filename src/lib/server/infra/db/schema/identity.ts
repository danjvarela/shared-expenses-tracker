import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './user';

export const identity = sqliteTable(
	'identity',
	{
		id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		provider: text().notNull(),
		providerSubject: text().notNull(),
		createdAt: integer({ mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('identity_provider_provider_subject_unique').on(t.provider, t.providerSubject)]
);
