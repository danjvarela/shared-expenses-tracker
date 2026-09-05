import { describe, it, expect } from 'vitest';
import type { IExpenseReceiptRepository } from '$lib/server/app/interfaces/repositories/expense-receipt';
import type { IReceiptStorageBackend } from '$lib/server/app/interfaces/receipt-storage';
import { createRecordingLogger } from '$lib/server/infra/logger/testing';
import { createReceiptGcService, RECEIPT_GC_GRACE_PERIOD_MS } from './receipt-gc';

const GRACE_MS = RECEIPT_GC_GRACE_PERIOD_MS;

function fakeStorageBackend(
	keys: Array<{ key: string; createdAt: Date }>
): IReceiptStorageBackend & { deletedKeys: string[]; failOn: Set<string> } {
	const deletedKeys: string[] = [];
	const failOn = new Set<string>();
	return {
		deletedKeys,
		failOn,
		async put() {
			throw new Error('not implemented');
		},
		async getReadUrl() {
			return null;
		},
		async getStream() {
			return new ReadableStream<Uint8Array>();
		},
		async delete(key) {
			if (failOn.has(key)) throw new Error('delete failed');
			deletedKeys.push(key);
		},
		async listKeys() {
			return keys.map((k) => ({ key: k.key, createdAt: k.createdAt }));
		}
	};
}

function fakeReceiptRepo(dbKeys: string[]): IExpenseReceiptRepository {
	return {
		async create() {
			throw new Error('not implemented');
		},
		async getById() {
			return null;
		},
		async getAllForExpenseGroup() {
			return [];
		},
		async getAllStorageKeys() {
			return dbKeys;
		},
		async delete() {}
	};
}

function keyAt(key: string, ageMs: number, now: Date): { key: string; createdAt: Date } {
	return { key, createdAt: new Date(now.getTime() - ageMs) };
}

describe('createReceiptGcService.reconcileOrphanedReceipts', () => {
	const now = new Date('2026-09-04T12:00:00Z');

	it('reports orphaned keys absent from the DB and older than the grace period', async () => {
		const storage = fakeStorageBackend([
			keyAt('orphan-old', GRACE_MS + 60_000, now),
			keyAt('orphan-older', GRACE_MS * 2, now),
			keyAt('referenced', GRACE_MS + 60_000, now)
		]);
		const svc = createReceiptGcService({
			receiptRepo: fakeReceiptRepo(['referenced']),
			storageBackend: storage,
			now: () => now
		});

		const result = await svc.reconcileOrphanedReceipts({ dryRun: true });

		expect(result.dryRun).toBe(true);
		expect(result.totalKeys).toBe(3);
		expect(result.orphanCount).toBe(2);
		expect(result.orphanKeys).toEqual(['orphan-old', 'orphan-older']);
		expect(result.deletedKeys).toEqual([]);
		expect(storage.deletedKeys).toEqual([]);
	});

	it('does not count a key orphaned if it is younger than the grace period', async () => {
		const storage = fakeStorageBackend([
			keyAt('fresh-orphan', GRACE_MS - 60_000, now),
			keyAt('edge-younger', GRACE_MS - 1, now)
		]);
		const svc = createReceiptGcService({
			receiptRepo: fakeReceiptRepo([]),
			storageBackend: storage,
			now: () => now
		});

		const result = await svc.reconcileOrphanedReceipts({ dryRun: true });

		expect(result.orphanKeys).toEqual([]);
		expect(result.orphanCount).toBe(0);
		expect(result.totalKeys).toBe(2);
	});

	it('treats a key exactly at the grace boundary as not orphaned (strict less-than)', async () => {
		const storage = fakeStorageBackend([keyAt('boundary', GRACE_MS, now)]);
		const svc = createReceiptGcService({
			receiptRepo: fakeReceiptRepo([]),
			storageBackend: storage,
			now: () => now
		});

		const result = await svc.reconcileOrphanedReceipts({ dryRun: true });

		expect(result.orphanKeys).toEqual([]);
	});

	it('does not count a key orphaned if the DB still references it', async () => {
		const storage = fakeStorageBackend([
			keyAt('referenced', GRACE_MS * 5, now),
			keyAt('orphan', GRACE_MS * 5, now)
		]);
		const svc = createReceiptGcService({
			receiptRepo: fakeReceiptRepo(['referenced']),
			storageBackend: storage,
			now: () => now
		});

		const result = await svc.reconcileOrphanedReceipts({ dryRun: true });

		expect(result.orphanKeys).toEqual(['orphan']);
	});

	it('deletes every orphan when dryRun is false', async () => {
		const storage = fakeStorageBackend([
			keyAt('orphan-a', GRACE_MS + 60_000, now),
			keyAt('orphan-b', GRACE_MS + 60_000, now)
		]);
		const svc = createReceiptGcService({
			receiptRepo: fakeReceiptRepo([]),
			storageBackend: storage,
			now: () => now
		});

		const result = await svc.reconcileOrphanedReceipts({ dryRun: false });

		expect(result.dryRun).toBe(false);
		expect(result.deletedKeys).toEqual(['orphan-a', 'orphan-b']);
		expect(storage.deletedKeys).toEqual(['orphan-a', 'orphan-b']);
	});

	it('continues past a failed delete (best-effort per key)', async () => {
		const storage = fakeStorageBackend([
			keyAt('orphan-a', GRACE_MS + 60_000, now),
			keyAt('orphan-b', GRACE_MS + 60_000, now),
			keyAt('orphan-c', GRACE_MS + 60_000, now)
		]);
		storage.failOn.add('orphan-b');
		const logger = createRecordingLogger();
		const svc = createReceiptGcService({
			receiptRepo: fakeReceiptRepo([]),
			storageBackend: storage,
			now: () => now,
			logger
		});

		const result = await svc.reconcileOrphanedReceipts({ dryRun: false });

		expect(result.deletedKeys).toEqual(['orphan-a', 'orphan-c']);
		expect(storage.deletedKeys).toEqual(['orphan-a', 'orphan-c']);
		const failed = logger.entries.filter((e) => e.message === 'failed to delete orphaned receipt bytes');
		expect(failed).toHaveLength(1);
		expect(failed[0].level).toBe('error');
		expect(failed[0].fields).toHaveProperty('key', 'orphan-b');
	});

	it('reports empty results when the storage backend has no keys', async () => {
		const storage = fakeStorageBackend([]);
		const svc = createReceiptGcService({
			receiptRepo: fakeReceiptRepo(['orphan']),
			storageBackend: storage,
			now: () => now
		});

		const result = await svc.reconcileOrphanedReceipts({ dryRun: false });

		expect(result).toEqual({
			dryRun: false,
			totalKeys: 0,
			orphanCount: 0,
			orphanKeys: [],
			deletedKeys: []
		});
	});

	it('defaults to the real clock when no now is provided', async () => {
		const storage = fakeStorageBackend([keyAt('ancient', 365 * 24 * 60 * 60 * 1000, new Date())]);
		const svc = createReceiptGcService({
			receiptRepo: fakeReceiptRepo([]),
			storageBackend: storage
		});

		const result = await svc.reconcileOrphanedReceipts({ dryRun: true });

		expect(result.orphanKeys).toEqual(['ancient']);
	});
});
