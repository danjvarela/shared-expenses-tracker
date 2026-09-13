import { describe, it, expect, vi, beforeEach } from 'vitest';

const userRepoMock = vi.hoisted(() => ({
	getById: vi.fn()
}));
const avatarStorageBackendMock = vi.hoisted(() => ({
	getStream: vi.fn()
}));

vi.mock('$lib/server/container', () => ({
	userRepo: userRepoMock,
	avatarStorageBackend: avatarStorageBackendMock
}));

import { GET } from './+server';

function makeEvent(userId: string) {
	return { params: { userId } } as unknown as Parameters<typeof GET>[0];
}

const WEBP = 'image/webp';
const storedKey = 'stored-key';
const avatarStream = new ReadableStream<Uint8Array>({
	start(controller) {
		controller.enqueue(new Uint8Array([1, 2, 3]));
		controller.close();
	}
});

describe('GET /(app)/avatars/[userId]', () => {
	beforeEach(() => {
		userRepoMock.getById.mockReset();
		avatarStorageBackendMock.getStream.mockReset();
	});

	it('returns 404 when the user does not exist', async () => {
		userRepoMock.getById.mockResolvedValue(null);

		await expect(GET(makeEvent('missing'))).rejects.toMatchObject({
			status: 404
		});
	});

	it('returns 404 when the user has no avatar', async () => {
		userRepoMock.getById.mockResolvedValue({
			id: 'alice',
			displayName: 'Alice',
			email: 'a@b.com',
			avatarStorageKey: null,
			avatarMime: null
		});

		await expect(GET(makeEvent('alice'))).rejects.toMatchObject({
			status: 404
		});
	});

	it('streams the avatar bytes with a private cache-control header', async () => {
		userRepoMock.getById.mockResolvedValue({
			id: 'alice',
			displayName: 'Alice',
			email: 'a@b.com',
			avatarStorageKey: storedKey,
			avatarMime: WEBP
		});
		avatarStorageBackendMock.getStream.mockResolvedValue(avatarStream);

		const response = await GET(makeEvent('alice'));

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe(WEBP);
		expect(response.headers.get('cache-control')).toBe('private, max-age=300');
		expect(avatarStorageBackendMock.getStream).toHaveBeenCalledWith(storedKey);
	});

	it('returns 404 when the storage backend cannot find the bytes', async () => {
		userRepoMock.getById.mockResolvedValue({
			id: 'alice',
			displayName: 'Alice',
			email: 'a@b.com',
			avatarStorageKey: storedKey,
			avatarMime: WEBP
		});
		avatarStorageBackendMock.getStream.mockRejectedValue(new Error('missing'));

		await expect(GET(makeEvent('alice'))).rejects.toMatchObject({
			status: 404
		});
	});
});
