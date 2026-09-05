import { basename } from 'node:path';
import { AppError } from '$lib/server/app/error';
import { ExpenseNotFoundError, ExpenseGroupNotFoundError } from '$lib/server/app/expense';
import { ALLOWED_RECEIPT_MIMES } from '$lib/server/app/receipt-format';
import type { IExpenseReceiptRepository } from '$lib/server/app/interfaces/repositories/expense-receipt';
import type { IExpenseRepository } from '$lib/server/app/interfaces/repositories/expense';
import type { IExpenseGroupRepository } from '$lib/server/app/interfaces/repositories/expense-group';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IReceiptStorageBackend } from '$lib/server/app/interfaces/receipt-storage';
import type { ExpenseReceipt } from '$lib/server/domain/expense-receipt';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export interface ReceiptCreateInput {
	expenseId: string;
	stream: ReadableStream<Uint8Array>;
	mime: string;
	filename?: string;
	sizeBytes: number;
}

export type ReceiptReadAccess =
	| { mime: string; storageKey: string; url: string }
	| { mime: string; storageKey: string; stream: ReadableStream<Uint8Array> };

export class ReceiptNotFoundError extends AppError {
	constructor() {
		super('Receipt not found', 404);
	}
}

export class ReceiptNotAuthorizedError extends AppError {
	constructor() {
		super("You don't have access to receipts in this group", 403);
	}
}

export class ReceiptTooLargeError extends AppError {
	constructor() {
		super('Receipt is too large', 413);
	}
}

export class ReceiptMimeNotAllowedError extends AppError {
	constructor() {
		super('Receipt file type is not supported', 415);
	}
}

export interface ReceiptServiceDeps {
	receiptRepo: IExpenseReceiptRepository;
	storageBackend: IReceiptStorageBackend;
	expenseRepo: IExpenseRepository;
	expenseGroupRepo: IExpenseGroupRepository;
	groupMemberRepo: IGroupMemberRepository;
}

function sanitizeFilename(filename: string | undefined): string | null {
	if (!filename) return null;
	const base = basename(filename);
	if (!base || base === '.') return null;
	return base.slice(0, 255);
}

export function createReceiptService(deps: ReceiptServiceDeps) {
	async function assertMemberForExpense(actorUserId: string, expenseId: string) {
		const expense = await deps.expenseRepo.getWithSplits(expenseId);
		if (!expense) throw new ExpenseNotFoundError();

		const isMember = await deps.groupMemberRepo.isMember(expense.groupId, actorUserId);
		if (!isMember) throw new ReceiptNotAuthorizedError();

		return expense;
	}

	async function assertMemberForExpenseGroup(actorUserId: string, expenseGroupId: string) {
		const expenseGroup = await deps.expenseGroupRepo.getById(expenseGroupId);
		if (!expenseGroup) throw new ExpenseGroupNotFoundError();

		const isMember = await deps.groupMemberRepo.isMember(expenseGroup.groupId, actorUserId);
		if (!isMember) throw new ReceiptNotAuthorizedError();

		return expenseGroup;
	}

	async function createReceipt(
		actorUserId: string,
		input: ReceiptCreateInput
	): Promise<ExpenseReceipt> {
		const expense = await assertMemberForExpense(actorUserId, input.expenseId);

		if (input.sizeBytes > MAX_RECEIPT_BYTES) throw new ReceiptTooLargeError();
		if (!ALLOWED_RECEIPT_MIMES.has(input.mime)) throw new ReceiptMimeNotAllowedError();

		const originalFilename = sanitizeFilename(input.filename);

		const { key } = await deps.storageBackend.put(input.stream, {
			mime: input.mime,
			filename: input.filename
		});

		try {
			return await deps.receiptRepo.create({
				expenseGroupId: expense.expenseGroupId,
				storageKey: key,
				mime: input.mime,
				sizeBytes: input.sizeBytes,
				originalFilename,
				uploadedByUserId: actorUserId
			});
		} catch (err) {
			await deps.storageBackend.delete(key).catch((deleteErr) => {
				console.error('Failed to roll back receipt bytes after repo failure', deleteErr);
			});
			throw err;
		}
	}

	async function getReceiptsForExpense(
		actorUserId: string,
		expenseId: string
	): Promise<Array<ExpenseReceipt>> {
		const expense = await assertMemberForExpense(actorUserId, expenseId);
		return deps.receiptRepo.getAllForExpenseGroup(expense.expenseGroupId);
	}

	async function getReadAccess(actorUserId: string, receiptId: string): Promise<ReceiptReadAccess> {
		const receipt = await deps.receiptRepo.getById(receiptId);
		if (!receipt) throw new ReceiptNotFoundError();

		await assertMemberForExpenseGroup(actorUserId, receipt.expenseGroupId);

		const url = await deps.storageBackend.getReadUrl(receipt.storageKey);
		if (url) return { mime: receipt.mime, storageKey: receipt.storageKey, url };

		const stream = await deps.storageBackend.getStream(receipt.storageKey);
		return { mime: receipt.mime, storageKey: receipt.storageKey, stream };
	}

	async function deleteReceipt(actorUserId: string, receiptId: string): Promise<void> {
		const receipt = await deps.receiptRepo.getById(receiptId);
		if (!receipt) return;

		await assertMemberForExpenseGroup(actorUserId, receipt.expenseGroupId);

		await deps.receiptRepo.delete(receiptId);
		await deps.storageBackend.delete(receipt.storageKey).catch((err) => {
			console.error('Failed to delete receipt bytes after row delete', err);
		});
	}

	return { createReceipt, getReceiptsForExpense, getReadAccess, deleteReceipt };
}

export type ReceiptService = ReturnType<typeof createReceiptService>;
