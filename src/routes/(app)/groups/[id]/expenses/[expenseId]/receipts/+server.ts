import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { expenseRepo, groupMemberRepo, receiptService } from '$lib/server/container';
import { MAX_RECEIPT_BYTES } from '$lib/server/app/receipt';
import { sniffMime } from '$lib/server/app/receipt-format';
import { toHttpError } from '$lib/server/presentation/error-handling';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const actor = locals.user!.id;

	const isMember = await groupMemberRepo.isMember(params.id, actor);
	if (!isMember) error(403, 'Not a member of this group');

	const expense = await expenseRepo.getWithSplits(params.expenseId);
	if (!expense || expense.groupId !== params.id) {
		error(404, 'Expense not found');
	}

	const formData = await request.formData();
	const file = formData.get('file');
	if (!(file instanceof File)) error(400, 'No file was uploaded');

	if (file.size === 0) error(400, 'The file is empty');
	if (file.size > MAX_RECEIPT_BYTES) error(413, 'The file is too large');

	const bytes = new Uint8Array(await file.arrayBuffer());
	const sniffedMime = sniffMime(bytes);
	if (!sniffedMime) error(415, 'This file type is not supported');

	try {
		const receipt = await receiptService.createReceipt(actor, {
			expenseId: params.expenseId,
			stream: new Blob([bytes]).stream(),
			mime: sniffedMime,
			filename: file.name,
			sizeBytes: file.size
		});
		return json(receipt, { status: 201 });
	} catch (err) {
		toHttpError(err);
	}
};
