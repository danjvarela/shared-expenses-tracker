import {
	FileStorageConfigError,
	type IFileStorageBackend
} from '$lib/server/app/interfaces/file-storage';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';
import { createFileSystemFileStorageBackend, resolveFsDir } from './fs';

export type { IFileStorageBackend } from '$lib/server/app/interfaces/file-storage';

export interface FileStorageBackendOptions {
	backend: string;
	fsDir: string;
	logger?: ILogger;
}

export function createFileStorageBackend(opts: FileStorageBackendOptions): IFileStorageBackend {
	const logger = opts.logger ?? NOOP_LOGGER;

	if (opts.backend === 'fs') {
		return createFileSystemFileStorageBackend(resolveFsDir(opts.fsDir));
	}

	logger.error('unknown file storage backend', { backend: opts.backend });
	throw new FileStorageConfigError();
}