import { json, error } from '@sveltejs/kit';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { gcSecret, avatarGcService } from '$lib/server/container';

function sha256(input: string): Buffer {
	return createHash('sha256').update(input).digest();
}

function tokenMatches(provided: string | null, expected: string): boolean {
	if (!provided) return false;
	return timingSafeEqual(sha256(provided), sha256(expected));
}

export const POST: RequestHandler = async ({ request }) => {
	if (!tokenMatches(request.headers.get('X-GC-Token'), gcSecret)) {
		error(401, 'Unauthorized');
	}

	const body = (await request.json().catch(() => ({}))) as { apply?: unknown };
	const dryRun = body.apply !== true;

	const result = await avatarGcService.reconcileOrphanedAvatars({ dryRun });
	return json(result);
};