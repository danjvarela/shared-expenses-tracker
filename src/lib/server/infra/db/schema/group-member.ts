import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { group } from './group';
import { user } from './user';

export const groupMember = sqliteTable(
	'group_member',
	{
		id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
		groupId: text()
			.notNull()
			.references(() => group.id, { onDelete: 'cascade' }),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		defaultSplitPercent: real(),
		createdAt: integer({ mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('group_member_group_id_user_id_unique').on(t.groupId, t.userId)]
);
