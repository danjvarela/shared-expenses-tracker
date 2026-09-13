import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { avatarStorageBackend, userRepo } from '$lib/server/container';

export const GET: RequestHandler = async ({ params }) => {
	const user = await userRepo.getById(params.userId);
	if (!user || !user.avatarStorageKey || !user.avatarMime) {
		error(404, 'Avatar not found');
	}

	let stream: ReadableStream<Uint8Array>;
	try {
		stream = await avatarStorageBackend.getStream(user.avatarStorageKey);
	} catch {
		error(404, 'Avatar not found');
	}

	return new Response(stream, {
		status: 200,
		headers: {
			'content-type': user.avatarMime,
			'cache-control': 'private, max-age=300'
		}
	});
};
