import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { receiptService } from '$lib/server/container';
import { toHttpError } from '$lib/server/presentation/error-handling';
import { assertDestructiveActionAllowed } from '$lib/server/infra/app-env';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const access = await receiptService.getReadAccess(locals.user!.id, params.receiptId);

		if ('url' in access) {
			redirect(302, access.url);
		}

		return new Response(access.stream, {
			status: 200,
			headers: { 'content-type': access.mime }
		});
	} catch (err) {
		toHttpError(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	assertDestructiveActionAllowed();

	try {
		await receiptService.deleteReceipt(locals.user!.id, params.receiptId);
		return new Response(null, { status: 204 });
	} catch (err) {
		toHttpError(err);
	}
};
