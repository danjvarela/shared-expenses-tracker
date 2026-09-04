import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileSystemReceiptStorageBackend } from './fs';

async function freshDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), 'receipt-fs-'));
}

async function touchFile(dir: string, name: string, ageMs = 0): Promise<void> {
	const path = join(dir, name);
	await writeFile(path, 'x');
	if (ageMs > 0) {
		const atime = new Date(Date.now() - ageMs);
		await utimes(path, atime, atime);
	}
}

describe('createFileSystemReceiptStorageBackend.listKeys', () => {
	it('returns an empty array when the storage dir is empty', async () => {
		const dir = await freshDir();
		const backend = createFileSystemReceiptStorageBackend(dir);

		expect(await backend.listKeys()).toEqual([]);
	});

	it('returns an empty array when only nested dirs exist (files only)', async () => {
		const dir = await freshDir();
		const backend = createFileSystemReceiptStorageBackend(dir);

		expect((await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile())).toHaveLength(0);
		expect(await backend.listKeys()).toEqual([]);
	});

	it('lists every file in the storage dir as a key', async () => {
		const dir = await freshDir();
		const backend = createFileSystemReceiptStorageBackend(dir);
		await touchFile(dir, 'key-a');
		await touchFile(dir, 'key-b');
		await touchFile(dir, 'key-c');

		const keys = (await backend.listKeys()).map((e) => e.key).sort();
		expect(keys).toEqual(['key-a', 'key-b', 'key-c']);
	});

	it('uses each file mtime as createdAt', async () => {
		const dir = await freshDir();
		const backend = createFileSystemReceiptStorageBackend(dir);
		const oldAge = 60_000;
		const recentAge = 1_000;
		await touchFile(dir, 'old', oldAge);
		await touchFile(dir, 'recent', recentAge);

		const byKey = new Map((await backend.listKeys()).map((e) => [e.key, e.createdAt]));
		const now = Date.now();
		expect(now - byKey.get('old')!.getTime()).toBeGreaterThanOrEqual(oldAge - 500);
		expect(now - byKey.get('recent')!.getTime()).toBeLessThan(recentAge + 500);
		expect(byKey.get('old')!.getTime()).toBeLessThan(byKey.get('recent')!.getTime());
	});

	it('returns a fresh array each call (no shared mutable reference)', async () => {
		const dir = await freshDir();
		const backend = createFileSystemReceiptStorageBackend(dir);
		await touchFile(dir, 'key-a');

		const first = await backend.listKeys();
		const second = await backend.listKeys();
		expect(first).not.toBe(second);
		expect(first).toEqual(second);
	});
});
