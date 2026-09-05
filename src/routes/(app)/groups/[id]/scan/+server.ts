import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scanService, scannerEnabled } from '$lib/server/container';
import { sniffMime } from '$lib/server/app/receipt-format';
import { toHttpError } from '$lib/server/presentation/error-handling';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!scannerEnabled || !scanService) error(404, 'Receipt scanning is not available');

	const formData = await request.formData();
	const file = formData.get('file');
	if (!(file instanceof File)) error(400, 'No file was uploaded');

	if (file.size === 0) error(400, 'The file is empty');

	const bytes = new Uint8Array(await file.arrayBuffer());
	const sniffedMime = sniffMime(bytes);
	if (!sniffedMime) error(415, 'This file type is not supported');

	try {
		const result = await scanService.scan(locals.user!.id, {
			groupId: params.id,
			bytes,
			sniffedMime,
			filename: file.name,
			sizeBytes: file.size
		});
		return json(result, { status: 200 });
	} catch (err) {
		toHttpError(err);
	}
};
