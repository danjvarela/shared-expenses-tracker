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

const findById =
	(db: Database): ICategoryRepository['findById'] =>
	async (categoryId) => {
		const rows = await db.select().from(category).where(eq(category.id, categoryId));
		return rows[0] ?? null;
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

const update =
	(db: Database): ICategoryRepository['update'] =>
	async (categoryId, input) => {
		const [row] = await db
			.update(category)
			.set({ name: input.name, icon: input.icon })
			.where(eq(category.id, categoryId))
			.returning();
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

const deleteCategory =
	(db: Database): ICategoryRepository['delete'] =>
	async (categoryId) => {
		await db.delete(category).where(eq(category.id, categoryId));
	};

export function createCategoryRepository(db: Database): ICategoryRepository {
	return {
		getAll: getAll(db),
		getDefaults: getDefaults(db),
		getAllForGroup: getAllForGroup(db),
		findById: findById(db),
		findByOwnerAndName: findByOwnerAndName(db),
		create: create(db),
		update: update(db),
		addToGroup: addToGroup(db),
		removeFromGroup: removeFromGroup(db),
		delete: deleteCategory(db)
	};
}
