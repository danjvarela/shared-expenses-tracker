import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { group } from './group';
import { user } from './user';

export const pairBalance = sqliteTable(
	'pair_balance',
	{
		id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
		groupId: text()
			.notNull()
			.references(() => group.id, { onDelete: 'cascade' }),
		fromUserId: text()
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		toUserId: text()
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		amountCents: integer().notNull(),
		createdAt: integer({ mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer({ mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('pair_balance_group_id_from_user_id_to_user_id_unique').on(
			t.groupId,
			t.fromUserId,
			t.toUserId
		)
	]
);
