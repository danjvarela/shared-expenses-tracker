import { describe, it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import * as schema from '$lib/server/infra/db/schema';
import { createCategoryRepository } from './category';

function makeDb() {
	const client = createClient({ url: ':memory:' });
	return drizzle(client, { schema, casing: 'snake_case' });
}

async function createTables(db: ReturnType<typeof makeDb>) {
	await db.run(sql`CREATE TABLE "group" (
		id TEXT PRIMARY KEY
	)`);
	await db.run(sql`CREATE TABLE category (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		icon TEXT NOT NULL,
		owner_group_id TEXT,
		created_at INTEGER NOT NULL
	)`);
	await db.run(sql`CREATE TABLE group_category (
		id TEXT PRIMARY KEY,
		group_id TEXT NOT NULL,
		category_id TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`);
}

async function insertGroup(db: ReturnType<typeof makeDb>, id: string) {
	await db.run(sql`INSERT INTO "group" (id) VALUES (${id})`);
}

async function insertCategory(
	db: ReturnType<typeof makeDb>,
	overrides: { id: string; name: string; ownerGroupId?: string | null }
) {
	await db.insert(schema.category).values({
		id: overrides.id,
		name: overrides.name,
		icon: '🍔',
		ownerGroupId: overrides.ownerGroupId ?? null,
		createdAt: new Date()
	});
}

describe('createCategoryRepository', () => {
	describe('getDefaults', () => {
		it('returns only categories with no owner group', async () => {
			const db = makeDb();
			await createTables(db);
			await insertGroup(db, 'group-1');
			await insertCategory(db, { id: 'cat-1', name: 'Food' });
			await insertCategory(db, { id: 'cat-2', name: 'Custom', ownerGroupId: 'group-1' });
			const repo = createCategoryRepository(db);

			const categories = await repo.getDefaults();

			expect(categories.map((c) => c.id)).toEqual(['cat-1']);
		});
	});

	describe('getAllForGroup', () => {
		it('returns only categories linked to the group via group_category', async () => {
			const db = makeDb();
			await createTables(db);
			await insertGroup(db, 'group-1');
			await insertGroup(db, 'group-2');
			await insertCategory(db, { id: 'cat-1', name: 'Food' });
			await insertCategory(db, { id: 'cat-2', name: 'Rent' });
			await db.insert(schema.groupCategory).values({ groupId: 'group-1', categoryId: 'cat-1' });
			await db.insert(schema.groupCategory).values({ groupId: 'group-2', categoryId: 'cat-2' });
			const repo = createCategoryRepository(db);

			const categories = await repo.getAllForGroup('group-1');

			expect(categories.map((c) => c.id)).toEqual(['cat-1']);
		});

		it('returns an empty array when the group has no linked categories', async () => {
			const db = makeDb();
			await createTables(db);
			await insertGroup(db, 'group-1');
			const repo = createCategoryRepository(db);

			expect(await repo.getAllForGroup('group-1')).toEqual([]);
		});
	});

	describe('create', () => {
		it('creates a category owned by the given group', async () => {
			const db = makeDb();
			await createTables(db);
			await insertGroup(db, 'group-1');
			const repo = createCategoryRepository(db);

			const created = await repo.create({ name: 'Groceries', icon: '🛒', ownerGroupId: 'group-1' });

			expect(created).toMatchObject({ name: 'Groceries', icon: '🛒', ownerGroupId: 'group-1' });
			expect(await repo.findByOwnerAndName('group-1', 'Groceries')).toMatchObject({
				id: created.id
			});
		});
	});

	describe('findByOwnerAndName', () => {
		it('returns null when no category with that name exists for the owner group', async () => {
			const db = makeDb();
			await createTables(db);
			await insertGroup(db, 'group-1');
			const repo = createCategoryRepository(db);

			expect(await repo.findByOwnerAndName('group-1', 'Groceries')).toBeNull();
		});

		it('does not match a category owned by a different group', async () => {
			const db = makeDb();
			await createTables(db);
			await insertGroup(db, 'group-1');
			await insertGroup(db, 'group-2');
			await insertCategory(db, { id: 'cat-1', name: 'Groceries', ownerGroupId: 'group-1' });
			const repo = createCategoryRepository(db);

			expect(await repo.findByOwnerAndName('group-2', 'Groceries')).toBeNull();
		});
	});

	describe('addToGroup', () => {
		it('creates a group_category row linking the group and category', async () => {
			const db = makeDb();
			await createTables(db);
			await insertGroup(db, 'group-1');
			await insertCategory(db, { id: 'cat-1', name: 'Food' });
			const repo = createCategoryRepository(db);

			await repo.addToGroup('group-1', 'cat-1');

			const categories = await repo.getAllForGroup('group-1');
			expect(categories.map((c) => c.id)).toEqual(['cat-1']);
		});
	});

	describe('removeFromGroup', () => {
		it('deletes the group_category row linking the group and category', async () => {
			const db = makeDb();
			await createTables(db);
			await insertGroup(db, 'group-1');
			await insertCategory(db, { id: 'cat-1', name: 'Food' });
			await db.insert(schema.groupCategory).values({ groupId: 'group-1', categoryId: 'cat-1' });
			const repo = createCategoryRepository(db);

			await repo.removeFromGroup('group-1', 'cat-1');

			expect(await repo.getAllForGroup('group-1')).toEqual([]);
		});

		it('does not affect other groups linked to the same category', async () => {
			const db = makeDb();
			await createTables(db);
			await insertGroup(db, 'group-1');
			await insertGroup(db, 'group-2');
			await insertCategory(db, { id: 'cat-1', name: 'Food' });
			await db.insert(schema.groupCategory).values({ groupId: 'group-1', categoryId: 'cat-1' });
			await db.insert(schema.groupCategory).values({ groupId: 'group-2', categoryId: 'cat-1' });
			const repo = createCategoryRepository(db);

			await repo.removeFromGroup('group-1', 'cat-1');

			expect((await repo.getAllForGroup('group-2')).map((c) => c.id)).toEqual(['cat-1']);
		});
	});
});
