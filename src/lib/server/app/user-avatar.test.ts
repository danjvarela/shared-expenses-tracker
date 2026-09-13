import { describe, it, expect, vi } from 'vitest';
import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import type { IFileStorageBackend } from '$lib/server/app/interfaces/file-storage';
import type {
	IAvatarNormalizer,
	NormalizedAvatar
} from '$lib/server/app/interfaces/avatar-normalizer';
import type { User } from '$lib/server/domain/user';
import { createUserService, AvatarTooLargeError, AvatarMimeNotAllowedError } from './user';
import { JPEG_MIME, PDF_MIME, PNG_MIME, WEBP_MIME } from './receipt-format';
import { MAX_AVATAR_BYTES } from './avatar-format';

const aliceId = 'alice';

function fakeUserRepo(seed: Partial<User> = {}): IUserRepository & {
	avatarUpdates: Array<{
		userId: string;
		avatarStorageKey: string | null;
		avatarMime: string | null;
	}>;
	current: User | null;
} {
	const avatarUpdates: Array<{
		userId: string;
		avatarStorageKey: string | null;
		avatarMime: string | null;
	}> = [];
	const current: User = {
		id: aliceId,
		displayName: 'Alice',
		email: 'alice@example.com',
		avatarStorageKey: seed.avatarStorageKey ?? null,
		avatarMime: seed.avatarMime ?? null
	};
	return {
		avatarUpdates,
		current,
		async findByEmail() {
			return null;
		},
		async getById(userId) {
			return userId === aliceId ? current : null;
		},
		async create() {
			throw new Error('not implemented');
		},
		async updateDisplayName() {},
		async updateAvatar(userId, avatar) {
			avatarUpdates.push({ userId, ...avatar });
			current.avatarStorageKey = avatar.avatarStorageKey;
			current.avatarMime = avatar.avatarMime;
		},
		async getAllAvatarStorageKeys() {
			return [];
		}
	};
}

function fakeStorage(): IFileStorageBackend & {
	putKeys: string[];
	deletedKeys: string[];
	streams: Map<string, ReadableStream<Uint8Array>>;
	putShouldThrow: boolean;
	deleteShouldThrow: boolean;
} {
	const putKeys: string[] = [];
	const deletedKeys: string[] = [];
	const streams = new Map<string, ReadableStream<Uint8Array>>();
	let nextKey = 0;
	return {
		putKeys,
		deletedKeys,
		streams,
		putShouldThrow: false,
		deleteShouldThrow: false,
		async put(stream) {
			if (this.putShouldThrow) throw new Error('put failed');
			const key = `key-${nextKey++}`;
			putKeys.push(key);
			streams.set(key, stream);
			return { key };
		},
		async getReadUrl() {
			return null;
		},
		async getStream(key) {
			return streams.get(key) ?? new ReadableStream<Uint8Array>();
		},
		async delete(key) {
			if (this.deleteShouldThrow) throw new Error('delete failed');
			deletedKeys.push(key);
			streams.delete(key);
		},
		async listKeys() {
			return putKeys.map((key) => ({ key, createdAt: new Date() }));
		}
	};
}

function fakeNormalizer(): IAvatarNormalizer & {
	calls: Array<{ bytes: Uint8Array; mime: string }>;
	webp: Uint8Array;
} {
	const calls: Array<{ bytes: Uint8Array; mime: string }> = [];
	const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
	return {
		calls,
		webp,
		async normalize(bytes, mime): Promise<NormalizedAvatar> {
			calls.push({ bytes: Buffer.from(bytes), mime });
			return { bytes: webp, mime: WEBP_MIME };
		}
	};
}

function service(
	opts: {
		storage?: ReturnType<typeof fakeStorage>;
		normalizer?: ReturnType<typeof fakeNormalizer>;
		userRepo?: ReturnType<typeof fakeUserRepo>;
		seed?: Partial<User>;
	} = {}
) {
	const storage = opts.storage ?? fakeStorage();
	const normalizer = opts.normalizer ?? fakeNormalizer();
	const userRepo = opts.userRepo ?? fakeUserRepo(opts.seed ?? {});
	const svc = createUserService({ userRepo, storageBackend: storage, normalizer });
	return { svc, storage, normalizer, userRepo };
}

describe('createUserService.updateAvatar', () => {
	it('rejects a file larger than the avatar size limit', async () => {
		const { svc, storage, userRepo } = service();

		await expect(
			svc.updateAvatar(aliceId, {
				bytes: new Uint8Array([1, 2, 3]),
				mime: PNG_MIME,
				sizeBytes: MAX_AVATAR_BYTES + 1
			})
		).rejects.toBeInstanceOf(AvatarTooLargeError);

		expect(storage.putKeys).toHaveLength(0);
		expect(userRepo.avatarUpdates).toHaveLength(0);
	});

	it('rejects a non-image mime (PDF)', async () => {
		const { svc, storage, userRepo } = service();

		await expect(
			svc.updateAvatar(aliceId, {
				bytes: new Uint8Array([1, 2, 3]),
				mime: PDF_MIME,
				sizeBytes: 3
			})
		).rejects.toBeInstanceOf(AvatarMimeNotAllowedError);

		expect(storage.putKeys).toHaveLength(0);
		expect(userRepo.avatarUpdates).toHaveLength(0);
	});

	it('rejects an unknown mime', async () => {
		const { svc } = service();

		await expect(
			svc.updateAvatar(aliceId, {
				bytes: new Uint8Array([1, 2, 3]),
				mime: 'text/plain',
				sizeBytes: 3
			})
		).rejects.toBeInstanceOf(AvatarMimeNotAllowedError);
	});

	it('normalizes the image, stores the normalized bytes, and records the key + webp mime', async () => {
		const { svc, storage, normalizer, userRepo } = service();
		const inputBytes = new Uint8Array([10, 20, 30, 40]);

		await svc.updateAvatar(aliceId, {
			bytes: inputBytes,
			mime: PNG_MIME,
			sizeBytes: inputBytes.length
		});

		expect(normalizer.calls).toHaveLength(1);
		expect(normalizer.calls[0].mime).toBe(PNG_MIME);

		expect(storage.putKeys).toHaveLength(1);
		expect(userRepo.avatarUpdates).toEqual([
			{
				userId: aliceId,
				avatarStorageKey: storage.putKeys[0],
				avatarMime: WEBP_MIME
			}
		]);

		const stored = await drainStream(storage.streams.get(storage.putKeys[0])!);
		expect(stored.equals(Buffer.from(normalizer.webp))).toBe(true);
	});

	it('best-effort deletes the previous storage key when replacing an avatar', async () => {
		const oldKey = 'old-key';
		const { svc, storage, userRepo } = service({
			seed: { avatarStorageKey: oldKey, avatarMime: WEBP_MIME }
		});

		await svc.updateAvatar(aliceId, {
			bytes: new Uint8Array([1]),
			mime: JPEG_MIME,
			sizeBytes: 1
		});

		expect(userRepo.avatarUpdates).toHaveLength(1);
		expect(userRepo.avatarUpdates[0].avatarStorageKey).toBe(storage.putKeys[0]);
		expect(storage.deletedKeys).toEqual([oldKey]);
	});

	it('does not throw when the previous key delete fails (best-effort)', async () => {
		const oldKey = 'old-key';
		const storage = fakeStorage();
		storage.deleteShouldThrow = true;
		storage.delete = vi.fn(async () => {
			throw new Error('delete failed');
		});
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { svc, userRepo } = service({ storage, seed: { avatarStorageKey: oldKey } });

		await svc.updateAvatar(aliceId, {
			bytes: new Uint8Array([1]),
			mime: JPEG_MIME,
			sizeBytes: 1
		});

		expect(userRepo.avatarUpdates).toHaveLength(1);
		expect(userRepo.avatarUpdates[0].avatarStorageKey).toBe(storage.putKeys[0]);
		expect(storage.delete).toHaveBeenCalledWith(oldKey);
		consoleSpy.mockRestore();
	});

	it('rolls back the just-stored key when the repo update throws', async () => {
		const storage = fakeStorage();
		const userRepo = fakeUserRepo();
		userRepo.updateAvatar = vi.fn(async () => {
			throw new Error('repo update failed');
		});
		const { svc } = service({ storage, userRepo });

		await expect(
			svc.updateAvatar(aliceId, {
				bytes: new Uint8Array([1]),
				mime: PNG_MIME,
				sizeBytes: 1
			})
		).rejects.toThrow('repo update failed');

		expect(storage.putKeys).toHaveLength(1);
		expect(storage.deletedKeys).toEqual([storage.putKeys[0]]);
	});

	it('does not attempt to delete a previous key when there was none', async () => {
		const { svc, storage } = service();

		await svc.updateAvatar(aliceId, {
			bytes: new Uint8Array([1]),
			mime: PNG_MIME,
			sizeBytes: 1
		});

		expect(storage.deletedKeys).toEqual([]);
	});
});

describe('createUserService.deleteAvatar', () => {
	it('clears the row and best-effort deletes the bytes', async () => {
		const oldKey = 'old-key';
		const { svc, storage, userRepo } = service({
			seed: { avatarStorageKey: oldKey, avatarMime: WEBP_MIME }
		});

		await svc.deleteAvatar(aliceId);

		expect(userRepo.avatarUpdates).toEqual([
			{ userId: aliceId, avatarStorageKey: null, avatarMime: null }
		]);
		expect(storage.deletedKeys).toEqual([oldKey]);
	});

	it('is a no-op when no avatar is set', async () => {
		const { svc, storage, userRepo } = service();

		await svc.deleteAvatar(aliceId);

		expect(userRepo.avatarUpdates).toHaveLength(0);
		expect(storage.deletedKeys).toHaveLength(0);
	});
});

async function drainStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
	const reader = stream.getReader();
	const chunks: Buffer[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(Buffer.from(value));
	}
	return Buffer.concat(chunks);
}
