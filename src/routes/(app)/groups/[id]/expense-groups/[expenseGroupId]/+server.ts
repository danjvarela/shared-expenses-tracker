import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { expenseService } from '$lib/server/container';
import type { ExpenseGroupEditLineInput } from '$lib/server/app/expense';
import { toHttpError } from '$lib/server/presentation/error-handling';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json().catch(() => null)) as {
		paidByUserId?: unknown;
		name?: unknown;
		lines?: unknown;
	} | null;

	if (!body || typeof body.paidByUserId !== 'string' || !Array.isArray(body.lines)) {
		error(400, 'Invalid edit');
	}

	try {
		const result = await expenseService.updateExpenseGroup(locals.user!.id, {
			expenseGroupId: params.expenseGroupId,
			paidByUserId: body.paidByUserId,
			name: typeof body.name === 'string' ? body.name : body.name === null ? null : undefined,
			lines: body.lines as ExpenseGroupEditLineInput[]
		});
		return json(result, { status: 200 });
	} catch (err) {
		toHttpError(err);
	}
};
