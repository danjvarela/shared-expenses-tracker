import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type { Database } from '$lib/server/infra/db/types';
import { group } from '$lib/server/infra/db/schema/group';
import { groupMember } from '$lib/server/infra/db/schema/group-member';
import { eq } from 'drizzle-orm';

const columns = {
	id: group.id,
	name: group.name,
	currencyCode: group.currencyCode,
	avatarIcon: group.avatarIcon,
	createdAt: group.createdAt
};

const getAll =
	(db: Database): IGroupRepository['getAll'] =>
	async (userId) => {
		const rows = await db
			.select(columns)
			.from(group)
			.innerJoin(groupMember, eq(groupMember.groupId, group.id))
			.where(eq(groupMember.userId, userId));

		return rows;
	};

const getById =
	(db: Database): IGroupRepository['getById'] =>
	async (id) => {
		const [row] = await db.select(columns).from(group).where(eq(group.id, id));

		return row ?? null;
	};

const create =
	(db: Database): IGroupRepository['create'] =>
	async (input) => {
		const [row] = await db.insert(group).values(input).returning(columns);

		return row;
	};

const update =
	(db: Database): IGroupRepository['update'] =>
	async (id, input) => {
		const [row] = await db.update(group).set(input).where(eq(group.id, id)).returning(columns);

		return row;
	};

const deleteGroup =
	(db: Database): IGroupRepository['delete'] =>
	async (id) => {
		await db.delete(group).where(eq(group.id, id));
	};

export function createGroupRepository(db: Database): IGroupRepository {
	return {
		getAll: getAll(db),
		getById: getById(db),
		create: create(db),
		update: update(db),
		delete: deleteGroup(db)
	};
}
