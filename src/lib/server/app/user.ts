import { AppError } from '$lib/server/app/error';
import { ALLOWED_AVATAR_MIMES, MAX_AVATAR_BYTES } from '$lib/server/app/avatar-format';
import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import type { IIdentityRepository } from '$lib/server/app/interfaces/repositories/identity';
import type { ISessionRepository } from '$lib/server/app/interfaces/repositories/session';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IFileStorageBackend } from '$lib/server/app/interfaces/file-storage';
import type { IAvatarNormalizer } from '$lib/server/app/interfaces/avatar-normalizer';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';

const DISPLAY_NAME_MAX = 50;

export class InvalidDisplayNameError extends AppError {
	constructor() {
		super('Display name must be 1–50 characters');
	}
}

export class AvatarTooLargeError extends AppError {
	constructor() {
		super('Avatar is too large', 413);
	}
}

export class AvatarMimeNotAllowedError extends AppError {
	constructor() {
		super('Avatar must be an image', 415);
	}
}

export class UserNotFoundError extends AppError {
	constructor() {
		super('User not found', 404);
	}
}

export interface ProfileInput {
	displayName: string;
}

export interface AvatarInput {
	bytes: Uint8Array;
	mime: string;
	sizeBytes: number;
}

export interface AnonymizeRepos {
	userRepo: IUserRepository;
	identityRepo: IIdentityRepository;
	sessionRepo: ISessionRepository;
	groupMemberRepo: IGroupMemberRepository;
}

export interface UserServiceDeps {
	userRepo: IUserRepository;
	uow: IUnitOfWork<AnonymizeRepos>;
	storageBackend: IFileStorageBackend;
	normalizer: IAvatarNormalizer;
	logger?: ILogger;
}

function bufferToStream(buf: Uint8Array): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(buf);
			controller.close();
		}
	});
}

export function createUserService(deps: UserServiceDeps) {
	const logger = deps.logger ?? NOOP_LOGGER;

	async function updateProfile(userId: string, input: ProfileInput): Promise<void> {
		const trimmed = input.displayName.trim();
		if (trimmed.length < 1 || trimmed.length > DISPLAY_NAME_MAX) {
			throw new InvalidDisplayNameError();
		}
		await deps.userRepo.updateDisplayName(userId, trimmed);
	}

	async function updateAvatar(actorUserId: string, input: AvatarInput): Promise<void> {
		if (input.sizeBytes > MAX_AVATAR_BYTES) throw new AvatarTooLargeError();
		if (!ALLOWED_AVATAR_MIMES.has(input.mime)) throw new AvatarMimeNotAllowedError();

		const current = await deps.userRepo.getById(actorUserId);
		if (!current) throw new UserNotFoundError();
		const oldKey = current.avatarStorageKey;

		const { bytes: normalizedBytes, mime: normalizedMime } = await deps.normalizer.normalize(
			input.bytes,
			input.mime
		);

		const { key } = await deps.storageBackend.put(bufferToStream(normalizedBytes), {
			mime: normalizedMime
		});

		try {
			await deps.userRepo.updateAvatar(actorUserId, {
				avatarStorageKey: key,
				avatarMime: normalizedMime
			});
		} catch (err) {
			await deps.storageBackend.delete(key).catch((deleteErr) => {
				logger.error('failed to roll back avatar bytes after repo failure', { err: deleteErr });
			});
			throw err;
		}

		if (oldKey) {
			await deps.storageBackend.delete(oldKey).catch((deleteErr) => {
				logger.error('failed to delete previous avatar bytes', { err: deleteErr });
			});
		}
	}

	async function deleteAvatar(actorUserId: string): Promise<void> {
		const current = await deps.userRepo.getById(actorUserId);
		if (!current) throw new UserNotFoundError();
		const oldKey = current.avatarStorageKey;
		if (!oldKey) return;

		await deps.userRepo.updateAvatar(actorUserId, {
			avatarStorageKey: null,
			avatarMime: null
		});
		await deps.storageBackend.delete(oldKey).catch((deleteErr) => {
			logger.error('failed to delete avatar bytes after delete', { err: deleteErr });
		});
	}

	async function anonymizeUser(userId: string): Promise<void> {
		const current = await deps.userRepo.getById(userId);
		if (!current) throw new UserNotFoundError();
		const oldAvatarKey = current.avatarStorageKey;

		await deps.uow.run(async ({ userRepo, identityRepo, sessionRepo, groupMemberRepo }) => {
			await identityRepo.deleteAllForUser(userId);
			await sessionRepo.deleteAllForUser(userId);

			const groupIds = await groupMemberRepo.getGroupIdsForUser(userId);
			for (const groupId of groupIds) {
				const count = await groupMemberRepo.countByGroup(groupId);
				if (count > 1) await groupMemberRepo.remove(groupId, userId);
			}

			await userRepo.anonymize(userId);
		});

		if (oldAvatarKey) {
			await deps.storageBackend.delete(oldAvatarKey).catch((deleteErr) => {
				logger.error('failed to delete avatar bytes after anonymize', { err: deleteErr });
			});
		}
	}

	return { updateProfile, updateAvatar, deleteAvatar, anonymizeUser };
}

export type UserService = ReturnType<typeof createUserService>;
