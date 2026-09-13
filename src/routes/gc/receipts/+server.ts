import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { gcSecret, receiptGcService } from '$lib/server/container';
import { tokenMatches } from '$lib/server/app/gc-auth';

export const POST: RequestHandler = async ({ request }) => {
	if (!tokenMatches(request.headers.get('X-GC-Token'), gcSecret)) {
		error(401, 'Unauthorized');
	}

	const body = (await request.json().catch(() => ({}))) as { apply?: unknown };
	const dryRun = body.apply !== true;

	const result = await receiptGcService.reconcileOrphanedReceipts({ dryRun });
	return json(result);
};
