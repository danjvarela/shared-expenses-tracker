import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scanService, scannerEnabled } from '$lib/server/container';
import type { ScanDraftLineInput } from '$lib/server/app/scan';
import { toHttpError } from '$lib/server/presentation/error-handling';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!scannerEnabled || !scanService) error(404, 'Receipt scanning is not available');

	const body = (await request.json().catch(() => null)) as {
		paidByUserId?: unknown;
		storageKey?: unknown;
		storageMeta?: unknown;
		lines?: unknown;
	} | null;

	if (
		!body ||
		typeof body.paidByUserId !== 'string' ||
		typeof body.storageKey !== 'string' ||
		!body.storageMeta ||
		typeof body.storageMeta !== 'object' ||
		!Array.isArray(body.lines)
	) {
		error(400, 'Invalid draft');
	}

	try {
		const result = await scanService.confirmDraft(locals.user!.id, {
			groupId: params.id,
			paidByUserId: body.paidByUserId,
			storageKey: body.storageKey,
			storageMeta: body.storageMeta as {
				mime: string;
				sizeBytes: number;
				originalFilename: string | null;
			},
			lines: body.lines as ScanDraftLineInput[]
		});
		return json(result, { status: 201 });
	} catch (err) {
		toHttpError(err);
	}
};
