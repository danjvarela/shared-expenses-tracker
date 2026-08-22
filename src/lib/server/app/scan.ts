import { basename } from 'node:path';
import {
	ReceiptMimeNotAllowedError,
	ReceiptNotAuthorizedError,
	ReceiptTooLargeError,
	MAX_RECEIPT_BYTES
} from '$lib/server/app/receipt';
import { AppError } from '$lib/server/app/error';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IExpenseRepository } from '$lib/server/app/interfaces/repositories/expense';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import type {
	IExpenseGroupRepository,
	ExpenseGroupCreateInput
} from '$lib/server/app/interfaces/repositories/expense-group';
import type { IExpenseReceiptRepository } from '$lib/server/app/interfaces/repositories/expense-receipt';
import type { IReceiptScanner, ScanResult } from '$lib/server/app/interfaces/receipt-scanner';
import type { IReceiptStorageBackend } from '$lib/server/app/interfaces/receipt-storage';
import { parseAmountCents } from '$lib/server/app/expense-form';
import { resolveSplits } from '$lib/server/app/split-resolver';
import { applyPairBalanceDeltas, expenseDeltas } from '$lib/server/app/pair-balance';

export const PDF_MIME = 'application/pdf';
export const PNG_MIME = 'image/png';
export const JPEG_MIME = 'image/jpeg';

export const ALLOWED_SCAN_MIMES = new Set<string>([PDF_MIME, PNG_MIME, JPEG_MIME]);

export type SniffedMime = typeof PDF_MIME | typeof PNG_MIME | typeof JPEG_MIME;

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

export function sniffMime(bytes: Uint8Array): SniffedMime | null {
	const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (buf.length >= PDF_MAGIC.length && buf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
		return PDF_MIME;
	}
	if (buf.length >= PNG_MAGIC.length && buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
		return PNG_MIME;
	}
	if (buf.length >= JPEG_MAGIC.length && buf.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
		return JPEG_MIME;
	}
	return null;
}

export interface ScanInput {
	groupId: string;
	stream: ReadableStream<Uint8Array>;
	sniffedMime: string;
	filename?: string;
	sizeBytes: number;
}

export interface ScanStorageMeta {
	mime: string;
	sizeBytes: number;
	originalFilename: string | null;
}

export interface ScanOutput {
	scanResult: ScanResult;
	storageKey: string;
	storageMeta: ScanStorageMeta;
}

export interface ScanDraftLineInput {
	description: string;
	amountDecimal: string;
	categoryId: string | null;
	date: string;
	percents: Record<string, string>;
}

export interface ScanConfirmInput {
	groupId: string;
	paidByUserId: string;
	storageKey: string;
	storageMeta: ScanStorageMeta;
	lines: ScanDraftLineInput[];
}

export interface ScanConfirmRepos {
	expenseRepo: IExpenseRepository;
	pairBalanceRepo: IPairBalanceRepository;
	expenseGroupRepo: IExpenseGroupRepository;
	receiptRepo: IExpenseReceiptRepository;
}

export interface ScanConfirmOutput {
	expenseGroupId: string;
	expenseIds: string[];
}

export class ScanDraftValidationError extends AppError {
	constructor(message: string) {
		super(message, 400);
	}
}

export interface ScanServiceDeps {
	storageBackend: IReceiptStorageBackend;
	scanner: IReceiptScanner;
	groupMemberRepo: IGroupMemberRepository;
	uow: IUnitOfWork<ScanConfirmRepos>;
}

function sanitizeFilename(filename: string | undefined): string | null {
	if (!filename) return null;
	const base = basename(filename);
	if (!base || base === '.') return null;
	return base.slice(0, 255);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(1)} ${units[unit]}`;
}

export function createScanService(deps: ScanServiceDeps) {
	async function scan(actorUserId: string, input: ScanInput): Promise<ScanOutput> {
		console.log('scan request started', { originalUploadSize: formatBytes(input.sizeBytes) });

		const isMember = await deps.groupMemberRepo.isMember(input.groupId, actorUserId);
		if (!isMember) throw new ReceiptNotAuthorizedError();

		if (input.sizeBytes > MAX_RECEIPT_BYTES) throw new ReceiptTooLargeError();
		if (!ALLOWED_SCAN_MIMES.has(input.sniffedMime)) throw new ReceiptMimeNotAllowedError();

		const originalFilename = sanitizeFilename(input.filename);

		const { key } = await deps.storageBackend.put(input.stream, {
			mime: input.sniffedMime,
			filename: originalFilename ?? undefined
		});

		// Put-first, no-persist: bytes are stored, then read back to feed the
		// scanner. Nothing is rolled back — a failure or discarded draft leaves
		// the bytes orphaned (gc'd later). Rasterization is the backend's
		// concern, not the service's: PDFs flow straight to the backend untouched.
		const stored = await deps.storageBackend.getStream(key);

		const scanResult = await deps.scanner.scan(stored, input.sniffedMime);
		return {
			scanResult,
			storageKey: key,
			storageMeta: {
				mime: input.sniffedMime,
				sizeBytes: input.sizeBytes,
				originalFilename
			}
		};
	}

	function normalizeCategoryId(raw: string | null): string | null {
		return typeof raw === 'string' && raw !== '' && raw !== 'none' ? raw : null;
	}

	function parseLineDate(raw: string): Date {
		if (typeof raw !== 'string' || raw.trim() === '') {
			throw new ScanDraftValidationError('Date is required for every line');
		}
		const date = new Date(raw);
		if (Number.isNaN(date.getTime())) {
			throw new ScanDraftValidationError('Invalid date');
		}
		return date;
	}

	function resolveLineSplits(
		amountCents: number,
		paidByUserId: string,
		members: Array<{ userId: string; defaultSplitPercent: number | null }>,
		percents: Record<string, string>
	): Array<{ userId: string; amountCents: number }> {
		const fromPercents = members.map((member) => {
			const raw = percents[member.userId];
			const included = typeof raw === 'string' && raw.trim() !== '';
			let percent: number | undefined;
			if (included) {
				percent = Number(raw);
				if (Number.isNaN(percent) || percent < 0) {
					throw new ScanDraftValidationError('Split percentages must be non-negative numbers');
				}
			}
			return { userId: member.userId, included, percent };
		});

		if (fromPercents.some((member) => member.included)) {
			return resolveSplits({
				method: 'percentage',
				amountCents,
				payerId: paidByUserId,
				members: fromPercents
			});
		}

		// No custom split specified — fall back to the group default split.
		const fromDefaults = members.map((member) => ({
			userId: member.userId,
			included: member.defaultSplitPercent !== null,
			percent: member.defaultSplitPercent ?? undefined
		}));

		if (fromDefaults.some((member) => member.included)) {
			return resolveSplits({
				method: 'percentage',
				amountCents,
				payerId: paidByUserId,
				members: fromDefaults
			});
		}

		// No default split configured — split equally among all members.
		return resolveSplits({
			method: 'equal',
			amountCents,
			payerId: paidByUserId,
			members: members.map((member) => ({ userId: member.userId, included: true }))
		});
	}

	function normalizeDraft(
		input: ScanConfirmInput,
		members: Array<{ userId: string; defaultSplitPercent: number | null }>
	): Array<{
		description: string;
		amountCents: number;
		categoryId: string | null;
		date: Date;
		splits: Array<{ userId: string; amountCents: number }>;
	}> {
		if (!Array.isArray(input.lines) || input.lines.length === 0) {
			throw new ScanDraftValidationError('Draft has no line items');
		}

		return input.lines.map((line) => {
			if (typeof line.description !== 'string' || line.description.trim() === '') {
				throw new ScanDraftValidationError('Description is required for every line');
			}
			const amountCents = parseAmountCents(line.amountDecimal);
			if (amountCents === null || amountCents <= 0) {
				throw new ScanDraftValidationError('Enter a valid amount for every line');
			}
			const date = parseLineDate(line.date);
			const splits = resolveLineSplits(amountCents, input.paidByUserId, members, line.percents);
			return {
				description: line.description.trim(),
				amountCents,
				categoryId: normalizeCategoryId(line.categoryId),
				date,
				splits
			};
		});
	}

	async function confirmDraft(
		actorUserId: string,
		input: ScanConfirmInput
	): Promise<ScanConfirmOutput> {
		const isMember = await deps.groupMemberRepo.isMember(input.groupId, actorUserId);
		if (!isMember) throw new ReceiptNotAuthorizedError();

		const members = await deps.groupMemberRepo.getAllForGroupWithUser(input.groupId);
		const memberIds = new Set(members.map((member) => member.userId));
		if (!memberIds.has(input.paidByUserId)) {
			throw new ScanDraftValidationError('Select who paid');
		}

		const normalized = normalizeDraft(input, members);

		return deps.uow.run(async ({ expenseRepo, pairBalanceRepo, expenseGroupRepo, receiptRepo }) => {
			const expenseGroup = await expenseGroupRepo.create({
				groupId: input.groupId
			} satisfies ExpenseGroupCreateInput);

			const expenseIds: string[] = [];
			for (const line of normalized) {
				const created = await expenseRepo.create({
					groupId: input.groupId,
					expenseGroupId: expenseGroup.id,
					paidByUserId: input.paidByUserId,
					categoryId: line.categoryId,
					description: line.description,
					amountCents: line.amountCents,
					date: line.date,
					splits: line.splits
				});
				expenseIds.push(created.id);

				await applyPairBalanceDeltas(
					pairBalanceRepo,
					input.groupId,
					expenseDeltas(input.paidByUserId, line.splits)
				);
			}

			await receiptRepo.create({
				expenseGroupId: expenseGroup.id,
				storageKey: input.storageKey,
				mime: input.storageMeta.mime,
				sizeBytes: input.storageMeta.sizeBytes,
				originalFilename: input.storageMeta.originalFilename,
				uploadedByUserId: actorUserId
			});

			return { expenseGroupId: expenseGroup.id, expenseIds };
		});
	}

	return { scan, confirmDraft };
}

export type ScanService = ReturnType<typeof createScanService>;
