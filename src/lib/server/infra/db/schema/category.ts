import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { group } from './group';

export const category = sqliteTable(
	'category',
	{
		id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
		name: text().notNull(),
		icon: text().notNull(),
		ownerGroupId: text().references(() => group.id, { onDelete: 'cascade' }),
		createdAt: integer({ mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('category_owner_group_id_name_unique').on(t.ownerGroupId, t.name)]
);
