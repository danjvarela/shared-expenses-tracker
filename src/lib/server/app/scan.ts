import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	ReceiptMimeNotAllowedError,
	ReceiptNotAuthorizedError,
	ReceiptTooLargeError,
	MAX_RECEIPT_BYTES
} from '$lib/server/app/receipt';
import { ALLOWED_RECEIPT_MIMES } from '$lib/server/app/receipt-format';
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
import type { IFileStorageBackend } from '$lib/server/app/interfaces/file-storage';
import type { IReceiptNormalizer } from '$lib/server/app/interfaces/receipt-normalizer';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';
import { parseAmountCents } from '$lib/server/app/expense-form';
import { resolveSplits } from '$lib/server/app/split-resolver';
import { applyPairBalanceDeltas, expenseDeltas } from '$lib/server/app/pair-balance';

export interface ScanInput {
	groupId: string;
	bytes: Uint8Array;
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
	storageBackend: IFileStorageBackend;
	normalizer: IReceiptNormalizer;
	scanner: IReceiptScanner;
	groupMemberRepo: IGroupMemberRepository;
	uow: IUnitOfWork<ScanConfirmRepos>;
	logger?: ILogger;
}

function sanitizeFilename(filename: string | undefined): string | null {
	if (!filename) return null;
	const base = basename(filename);
	if (!base || base === '.') return null;
	return base.slice(0, 255);
}

function elapsed(t0: number): number {
	return Date.now() - t0;
}

export function createScanService(deps: ScanServiceDeps) {
	const logger = deps.logger ?? NOOP_LOGGER;

	async function scan(actorUserId: string, input: ScanInput): Promise<ScanOutput> {
		const log = logger.child({ scanId: randomUUID(), groupId: input.groupId, actorUserId });
		log.info('receipt scan started', { originalSizeBytes: input.sizeBytes, sniffedMime: input.sniffedMime });

		const isMember = await deps.groupMemberRepo.isMember(input.groupId, actorUserId);
		if (!isMember) throw new ReceiptNotAuthorizedError();

		if (input.sizeBytes > MAX_RECEIPT_BYTES) throw new ReceiptTooLargeError();
		if (!ALLOWED_RECEIPT_MIMES.has(input.sniffedMime)) throw new ReceiptMimeNotAllowedError();

		log.info('receipt accepted', { sizeBytes: input.sizeBytes, mime: input.sniffedMime });

		const originalFilename = sanitizeFilename(input.filename);

		log.info('normalize starting', { fromMime: input.sniffedMime });
		const normalizeT0 = Date.now();
		const { bytes: normalizedBytes, mime: normalizedMime } = await deps.normalizer.normalize(
			input.bytes,
			input.sniffedMime
		);
		log.info('normalize done', {
			toMime: normalizedMime,
			sizeBytes: normalizedBytes.length,
			durationMs: elapsed(normalizeT0)
		});

		const { key } = await deps.storageBackend.put(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(normalizedBytes);
					controller.close();
				}
			}),
			{
				mime: normalizedMime,
				filename: originalFilename ?? undefined
			}
		);
		log.info('receipt stored', { storageKey: key, sizeBytes: normalizedBytes.length });

		// Put-first, no-persist: bytes are stored, then read back to feed the
		// scanner. Nothing is rolled back — a failure or discarded draft leaves
		// the bytes orphaned (gc'd later). The stored artifact is already the
		// normalized JPEG/PDF; the scanner receives the normalized mime.
		const stored = await deps.storageBackend.getStream(key);
		log.info('receipt read-back', { storageKey: key });

		log.info('scan starting', { storageKey: key, mime: normalizedMime });
		const scanT0 = Date.now();
		const scanResult = await deps.scanner.scan(stored, normalizedMime);
		log.info('scan done', {
			lineItems: scanResult.lineItems.length,
			durationMs: elapsed(scanT0)
		});

		log.info('receipt scan complete', { lineItems: scanResult.lineItems.length, storageKey: key });
		return {
			scanResult,
			storageKey: key,
			storageMeta: {
				mime: normalizedMime,
				sizeBytes: normalizedBytes.length,
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
		const log = logger.child({
			groupId: input.groupId,
			actorUserId,
			paidByUserId: input.paidByUserId
		});
		log.info('draft confirm started', { storageKey: input.storageKey, lineCount: input.lines.length });

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
			log.info('expense group created', { expenseGroupId: expenseGroup.id });

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
				log.info('expense created', { expenseId: created.id, amountCents: line.amountCents });

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
			log.info('receipt linked', { storageKey: input.storageKey, expenseGroupId: expenseGroup.id });

			log.info('draft confirm complete', {
				expenseGroupId: expenseGroup.id,
				expenseIds: expenseIds.length
			});
			return { expenseGroupId: expenseGroup.id, expenseIds };
		});
	}

	return { scan, confirmDraft };
}

export type ScanService = ReturnType<typeof createScanService>;
