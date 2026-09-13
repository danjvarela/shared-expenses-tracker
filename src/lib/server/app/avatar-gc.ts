import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import type { IFileStorageBackend } from '$lib/server/app/interfaces/file-storage';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';

export const AVATAR_GC_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export interface AvatarGcDeps {
	userRepo: IUserRepository;
	storageBackend: IFileStorageBackend;
	now?: () => Date;
	logger?: ILogger;
}

export interface AvatarGcOptions {
	dryRun: boolean;
}

export interface AvatarGcResult {
	dryRun: boolean;
	totalKeys: number;
	orphanCount: number;
	orphanKeys: string[];
	deletedKeys: string[];
}

export function createAvatarGcService(deps: AvatarGcDeps) {
	const now = deps.now ?? (() => new Date());
	const logger = deps.logger ?? NOOP_LOGGER;

	async function reconcileOrphanedAvatars(options: AvatarGcOptions): Promise<AvatarGcResult> {
		const dryRun = options.dryRun;

		const [storageKeys, dbKeys] = await Promise.all([
			deps.storageBackend.listKeys(),
			deps.userRepo.getAllAvatarStorageKeys()
		]);

		const referenced = new Set(dbKeys);
		const cutoff = now().getTime() - AVATAR_GC_GRACE_PERIOD_MS;

		const orphanKeys = storageKeys
			.filter((entry) => !referenced.has(entry.key))
			.filter((entry) => entry.createdAt.getTime() < cutoff)
			.map((entry) => entry.key);

		const deletedKeys: string[] = [];
		if (!dryRun) {
			for (const key of orphanKeys) {
				try {
					await deps.storageBackend.delete(key);
					deletedKeys.push(key);
				} catch (err) {
					logger.error('failed to delete orphaned avatar bytes', { key, err });
				}
			}
		}

		return {
			dryRun,
			totalKeys: storageKeys.length,
			orphanCount: orphanKeys.length,
			orphanKeys,
			deletedKeys
		};
	}

	return { reconcileOrphanedAvatars };
}

export type AvatarGcService = ReturnType<typeof createAvatarGcService>;