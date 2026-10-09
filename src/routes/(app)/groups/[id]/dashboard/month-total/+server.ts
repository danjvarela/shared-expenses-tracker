import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dashboardService } from '$lib/server/container';
import { toHttpError } from '$lib/server/presentation/error-handling';

export const GET: RequestHandler = async ({ params, url }) => {
	const month = url.searchParams.get('month');
	if (!month) {
		error(400, 'Missing month');
	}

	try {
		const totalCents = await dashboardService.getMonthTotalCents(params.id, month);
		return json({ totalCents });
	} catch (err) {
		toHttpError(err);
	}
};
