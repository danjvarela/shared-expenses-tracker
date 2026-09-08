import { describe, it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as schema from '$lib/server/infra/db/schema';
import { createGroupRepository } from '$lib/server/infra/db/repositories/group';
import { createGroupMemberRepository } from '$lib/server/infra/db/repositories/group-member';
import { createCategoryRepository } from '$lib/server/infra/db/repositories/category';
import { createGroupService, type GroupRepos } from './group';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';

let dbCounter = 0;

function makeDb() {
	dbCounter += 1;
	const dir = mkdtempSync(join(tmpdir(), 'group-creation-test-'));
	const client = createClient({ url: `file:${join(dir, `db-${dbCounter}.sqlite`)}` });
	return drizzle(client, { schema, casing: 'snake_case' });
}

type Db = ReturnType<typeof makeDb>;

async function createTables(db: Db) {
	await db.run(sql`CREATE TABLE "group" (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		currency_code TEXT NOT NULL,
		avatar_icon TEXT,
		created_at INTEGER NOT NULL
	)`);
	await db.run(sql`CREATE TABLE group_member (
		id TEXT PRIMARY KEY,
		group_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		default_split_percent REAL,
		created_at INTEGER NOT NULL
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

async function insertDefaultCategories(db: Db) {
	await db.insert(schema.category).values([
		{ id: 'cat-rent', name: 'Rent', icon: '🏠', ownerGroupId: null, createdAt: new Date() },
		{ id: 'cat-food', name: 'Food', icon: '🍔', ownerGroupId: null, createdAt: new Date() }
	]);
}

function realUow(db: Db): IUnitOfWork<GroupRepos> {
	return {
		run(fn) {
			return db.transaction((tx) =>
				fn({
					groupRepo: createGroupRepository(tx),
					groupMemberRepo: createGroupMemberRepository(tx),
					categoryRepo: createCategoryRepository(tx)
				})
			);
		}
	};
}

describe('createGroupService (integration)', () => {
	it('links a newly created group to exactly the default category set', async () => {
		const db = makeDb();
		await createTables(db);
		await insertDefaultCategories(db);
		const groupRepo = createGroupRepository(db);
		const categoryRepo = createCategoryRepository(db);
		const service = createGroupService({
			uow: realUow(db),
			groupRepo,
			pairBalanceRepo: {
				async getForPair() {
					return null;
				},
				async replaceForPair() {},
				async getAllForGroup() {
					return [];
				},
				async getNetForUserInGroups() {
					return new Map();
				},
				async hasBalanceForUserInGroup() {
					return false;
				},
				async getDebtsForUser() {
					return [];
				},
				async getDebtsForUserInGroup() {
					return [];
				},
				async replaceAllForGroup() {}
			}
		});

		const created = await service.createGroup({
			name: 'Trip',
			currencyCode: 'PHP',
			avatarIcon: null,
			creatorUserId: 'alice'
		});

		const linked = await categoryRepo.getAllForGroup(created.id);
		expect(linked.map((c) => c.id).sort()).toEqual(['cat-food', 'cat-rent']);
	});

	it('leaves no orphan group_category rows when group creation rolls back', async () => {
		const db = makeDb();
		await createTables(db);
		await insertDefaultCategories(db);
		const groupRepo = createGroupRepository(db);
		const failingUow: IUnitOfWork<GroupRepos> = {
			run(fn) {
				return db.transaction((tx) =>
					fn({
						groupRepo: createGroupRepository(tx),
						groupMemberRepo: createGroupMemberRepository(tx),
						categoryRepo: {
							...createCategoryRepository(tx),
							async addToGroup() {
								throw new Error('boom');
							}
						}
					})
				);
			}
		};
		const service = createGroupService({
			uow: failingUow,
			groupRepo,
			pairBalanceRepo: {
				async getForPair() {
					return null;
				},
				async replaceForPair() {},
				async getAllForGroup() {
					return [];
				},
				async getNetForUserInGroups() {
					return new Map();
				},
				async hasBalanceForUserInGroup() {
					return false;
				},
				async getDebtsForUser() {
					return [];
				},
				async getDebtsForUserInGroup() {
					return [];
				},
				async replaceAllForGroup() {}
			}
		});

		await expect(
			service.createGroup({
				name: 'Trip',
				currencyCode: 'PHP',
				avatarIcon: null,
				creatorUserId: 'alice'
			})
		).rejects.toThrow('boom');

		expect(await groupRepo.getAll('alice')).toEqual([]);
		const remainingMembers = await db.select().from(schema.groupMember);
		expect(remainingMembers).toEqual([]);
		const remainingLinks = await db.select().from(schema.groupCategory);
		expect(remainingLinks).toEqual([]);
	});
});
