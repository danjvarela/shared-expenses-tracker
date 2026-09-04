import { describe, it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import * as schema from '$lib/server/infra/db/schema';
import { createExpenseReceiptRepository } from './expense-receipt';

function makeDb() {
	const client = createClient({ url: ':memory:' });
	return drizzle(client, { schema, casing: 'snake_case' });
}

async function createTable(db: ReturnType<typeof makeDb>) {
	await db.run(sql`CREATE TABLE expense_receipt (
		id TEXT PRIMARY KEY,
		expense_group_id TEXT NOT NULL,
		storage_key TEXT NOT NULL,
		mime TEXT NOT NULL,
		size_bytes INTEGER NOT NULL,
		original_filename TEXT,
		uploaded_by_user_id TEXT NOT NULL,
		uploaded_at INTEGER NOT NULL
	)`);
}

async function insertRow(
	db: ReturnType<typeof makeDb>,
	overrides: { id: string; storageKey: string }
) {
	await db.insert(schema.expenseReceipt).values({
		id: overrides.id,
		expenseGroupId: 'expense-group-1',
		storageKey: overrides.storageKey,
		mime: 'image/png',
		sizeBytes: 3,
		originalFilename: null,
		uploadedByUserId: 'alice',
		uploadedAt: new Date()
	});
}

describe('createExpenseReceiptRepository.getAllStorageKeys', () => {
	it('returns an empty array when there are no receipt rows', async () => {
		const db = makeDb();
		await createTable(db);
		const repo = createExpenseReceiptRepository(db);

		expect(await repo.getAllStorageKeys()).toEqual([]);
	});

	it('returns every storageKey as a flat list of strings', async () => {
		const db = makeDb();
		await createTable(db);
		await insertRow(db, { id: 'r1', storageKey: 'key-a' });
		await insertRow(db, { id: 'r2', storageKey: 'key-b' });
		await insertRow(db, { id: 'r3', storageKey: 'key-c' });
		const repo = createExpenseReceiptRepository(db);

		const keys = (await repo.getAllStorageKeys()).slice().sort();
		expect(keys).toEqual(['key-a', 'key-b', 'key-c']);
	});

	it('projects only storageKey — no row objects', async () => {
		const db = makeDb();
		await createTable(db);
		await insertRow(db, { id: 'r1', storageKey: 'key-a' });
		const repo = createExpenseReceiptRepository(db);

		const [first] = await repo.getAllStorageKeys();
		expect(typeof first).toBe('string');
		expect(first).toBe('key-a');
	});

	it('returns duplicate storageKeys when multiple rows share one', async () => {
		const db = makeDb();
		await createTable(db);
		await insertRow(db, { id: 'r1', storageKey: 'key-shared' });
		await insertRow(db, { id: 'r2', storageKey: 'key-shared' });
		const repo = createExpenseReceiptRepository(db);

		expect(await repo.getAllStorageKeys()).toEqual(['key-shared', 'key-shared']);
	});
});
