import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { group } from './group';
import { category } from './category';

export const groupCategory = sqliteTable(
	'group_category',
	{
		id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
		groupId: text()
			.notNull()
			.references(() => group.id, { onDelete: 'cascade' }),
		categoryId: text()
			.notNull()
			.references(() => category.id, { onDelete: 'cascade' }),
		createdAt: integer({ mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('group_category_group_id_category_id_unique').on(t.groupId, t.categoryId)]
);
