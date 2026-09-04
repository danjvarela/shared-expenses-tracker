import { access, rm, readdir, stat } from 'node:fs/promises';
import { createWriteStream, createReadStream, mkdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import {
	ReceiptStorageError,
	type IReceiptStorageBackend,
	type ReceiptPutResult,
	type ReceiptStorageKey
} from '$lib/server/app/interfaces/receipt-storage';

function safeKey(key: string): string {
	if (!key || key.includes('/') || key.includes('\\') || key === '.') {
		throw new ReceiptStorageError('Invalid storage key');
	}
	return key;
}

export function createFileSystemReceiptStorageBackend(dir: string): IReceiptStorageBackend {
	mkdirSync(dir, { recursive: true });

	const put = async (stream: ReadableStream<Uint8Array>): Promise<ReceiptPutResult> => {
		const key = randomUUID();
		const filePath = join(dir, key);
		try {
			// `unknown` cast bridges the DOM lib ReadableStream<Uint8Array<ArrayBufferLike>>
			// and Node's ReadableStream<Uint8Array<ArrayBuffer>> reader variance.
			const nodeStream = Readable.fromWeb(
				stream as unknown as Parameters<typeof Readable.fromWeb>[0]
			);
			await pipeline(nodeStream, createWriteStream(filePath));
		} catch (err) {
			await rm(filePath, { force: true }).catch(() => {});
			throw new ReceiptStorageError(`Failed to store receipt: ${String(err)}`);
		}
		return { key };
	};

	const getReadUrl = async (): Promise<string | null> => null;

	const getStream = async (key: string): Promise<ReadableStream<Uint8Array>> => {
		const filePath = join(dir, safeKey(key));
		try {
			await access(filePath);
		} catch {
			throw new ReceiptStorageError('Receipt not found in storage');
		}
		return Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
	};

	const remove = async (key: string): Promise<void> => {
		await rm(join(dir, safeKey(key)), { force: true });
	};

	const listKeys = async (): Promise<ReceiptStorageKey[]> => {
		const entries = await readdir(dir, { withFileTypes: true });
		const files = entries.filter((entry) => entry.isFile());
		const keys: ReceiptStorageKey[] = [];
		for (const file of files) {
			const { mtime } = await stat(join(dir, file.name));
			keys.push({ key: file.name, createdAt: mtime });
		}
		return keys;
	};

	return { put, getReadUrl, getStream, delete: remove, listKeys };
}

export function resolveFsDir(dir: string): string {
	return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}
