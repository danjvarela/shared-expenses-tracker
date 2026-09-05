import { env } from '$env/dynamic/private';
import {
	ReceiptStorageConfigError,
	type IReceiptStorageBackend
} from '$lib/server/app/interfaces/receipt-storage';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';
import { createFileSystemReceiptStorageBackend, resolveFsDir } from './fs';

export type { IReceiptStorageBackend } from '$lib/server/app/interfaces/receipt-storage';

export function createReceiptStorageBackend(opts: { logger?: ILogger } = {}): IReceiptStorageBackend {
	const logger = opts.logger ?? NOOP_LOGGER;
	const backend = env.RECEIPT_STORAGE_BACKEND ?? 'fs';

	if (backend === 'fs') {
		const dir = resolveFsDir(env.RECEIPT_STORAGE_FS_DIR ?? './uploads');
		return createFileSystemReceiptStorageBackend(dir);
	}

	logger.error('unknown receipt storage backend', { backend });
	throw new ReceiptStorageConfigError();
}
