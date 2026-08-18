import { env } from '$env/dynamic/private';
import {
	ReceiptStorageConfigError,
	type IReceiptStorageBackend
} from '$lib/server/app/interfaces/receipt-storage';
import { createFileSystemReceiptStorageBackend, resolveFsDir } from './fs';

export type { IReceiptStorageBackend } from '$lib/server/app/interfaces/receipt-storage';

export function createReceiptStorageBackend(): IReceiptStorageBackend {
	const backend = env.RECEIPT_STORAGE_BACKEND ?? 'fs';

	if (backend === 'fs') {
		const dir = resolveFsDir(env.RECEIPT_STORAGE_FS_DIR ?? './uploads');
		return createFileSystemReceiptStorageBackend(dir);
	}

	console.error('Unknown receipt storage backend', backend);
	throw new ReceiptStorageConfigError();
}
