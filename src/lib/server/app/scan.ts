import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	ReceiptMimeNotAllowedError,
	ReceiptNotAuthorizedError,
	ReceiptTooLargeError,
	MAX_RECEIPT_BYTES
} from '$lib/server/app/receipt';
import { ALLOWED_RECEIPT_MIMES } from '$lib/server/app/receipt-format';
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
import { applyPairBalanceDeltas, expenseDeltas } from '$lib/server/app/pair-balance';
import {
	DraftValidationError,
	normalizeDraftLines,
	type DraftLineInput
} from '$lib/server/app/draft-line';

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

export type ScanDraftLineInput = DraftLineInput;

export interface ScanConfirmInput {
	groupId: string;
	paidByUserId: string;
	storageKey: string;
	storageMeta: ScanStorageMeta;
	lines: ScanDraftLineInput[];
	name?: string | null;
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

export { DraftValidationError as ScanDraftValidationError };

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
		log.info('receipt scan started', {
			originalSizeBytes: input.sizeBytes,
			sniffedMime: input.sniffedMime
		});

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

	async function confirmDraft(
		actorUserId: string,
		input: ScanConfirmInput
	): Promise<ScanConfirmOutput> {
		const log = logger.child({
			groupId: input.groupId,
			actorUserId,
			paidByUserId: input.paidByUserId
		});
		log.info('draft confirm started', {
			storageKey: input.storageKey,
			lineCount: input.lines.length
		});

		const isMember = await deps.groupMemberRepo.isMember(input.groupId, actorUserId);
		if (!isMember) throw new ReceiptNotAuthorizedError();

		const members = await deps.groupMemberRepo.getAllForGroupWithUser(input.groupId);
		const memberIds = new Set(members.map((member) => member.userId));
		if (!memberIds.has(input.paidByUserId)) {
			throw new DraftValidationError('Select who paid');
		}

		const normalized = normalizeDraftLines(input.lines, input.paidByUserId, members);

		return deps.uow.run(async ({ expenseRepo, pairBalanceRepo, expenseGroupRepo, receiptRepo }) => {
			const expenseGroup = await expenseGroupRepo.create({
				groupId: input.groupId,
				name: input.name ?? null
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
