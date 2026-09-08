import { and, eq, isNull } from 'drizzle-orm';
import type { ICategoryRepository } from '$lib/server/app/interfaces/repositories/category';
import type { Database } from '$lib/server/infra/db/types';
import { category } from '$lib/server/infra/db/schema/category';
import { groupCategory } from '$lib/server/infra/db/schema/group-category';

const getAll =
	(db: Database): ICategoryRepository['getAll'] =>
	async () => {
		return await db.select().from(category);
	};

const getDefaults =
	(db: Database): ICategoryRepository['getDefaults'] =>
	async () => {
		return await db.select().from(category).where(isNull(category.ownerGroupId));
	};

const getAllForGroup =
	(db: Database): ICategoryRepository['getAllForGroup'] =>
	async (groupId) => {
		const rows = await db
			.select({ category })
			.from(groupCategory)
			.innerJoin(category, eq(category.id, groupCategory.categoryId))
			.where(eq(groupCategory.groupId, groupId));

		return rows.map((row) => row.category);
	};

const findByOwnerAndName =
	(db: Database): ICategoryRepository['findByOwnerAndName'] =>
	async (ownerGroupId, name) => {
		const rows = await db
			.select()
			.from(category)
			.where(and(eq(category.ownerGroupId, ownerGroupId), eq(category.name, name)));

		return rows[0] ?? null;
	};

const create =
	(db: Database): ICategoryRepository['create'] =>
	async (input) => {
		const [row] = await db.insert(category).values(input).returning();
		return row;
	};

const addToGroup =
	(db: Database): ICategoryRepository['addToGroup'] =>
	async (groupId, categoryId) => {
		await db.insert(groupCategory).values({ groupId, categoryId });
	};

const removeFromGroup =
	(db: Database): ICategoryRepository['removeFromGroup'] =>
	async (groupId, categoryId) => {
		await db
			.delete(groupCategory)
			.where(and(eq(groupCategory.groupId, groupId), eq(groupCategory.categoryId, categoryId)));
	};

export function createCategoryRepository(db: Database): ICategoryRepository {
	return {
		getAll: getAll(db),
		getDefaults: getDefaults(db),
		getAllForGroup: getAllForGroup(db),
		findByOwnerAndName: findByOwnerAndName(db),
		create: create(db),
		addToGroup: addToGroup(db),
		removeFromGroup: removeFromGroup(db)
	};
}
