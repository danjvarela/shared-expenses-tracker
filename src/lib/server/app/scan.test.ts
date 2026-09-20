import { describe, it, expect, vi } from 'vitest';
import { createScanService } from './scan';
import { PDF_MIME, PNG_MIME, JPEG_MIME } from './receipt-format';
import {
	ReceiptNotAuthorizedError,
	ReceiptTooLargeError,
	ReceiptMimeNotAllowedError,
	MAX_RECEIPT_BYTES
} from './receipt';
import {
	ReceiptScannerError,
	type IReceiptScanner,
	type ScanResult
} from '$lib/server/app/interfaces/receipt-scanner';
import type { IFileStorageBackend } from '$lib/server/app/interfaces/file-storage';
import type {
	IReceiptNormalizer,
	NormalizedReceipt
} from '$lib/server/app/interfaces/receipt-normalizer';
import type {
	IGroupMemberRepository,
	GroupMemberWithUser
} from '$lib/server/app/interfaces/repositories/group-member';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type {
	IExpenseRepository,
	ExpenseWithSplits
} from '$lib/server/app/interfaces/repositories/expense';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import type {
	IExpenseGroupRepository,
	ExpenseGroupCreateInput
} from '$lib/server/app/interfaces/repositories/expense-group';
import type { IExpenseReceiptRepository } from '$lib/server/app/interfaces/repositories/expense-receipt';
import type { ILogger } from '$lib/server/app/interfaces/logger';
import { createRecordingLogger } from '$lib/server/infra/logger/testing';
import type { ExpenseGroup } from '$lib/server/domain/expense-group';
import type { ExpenseReceipt } from '$lib/server/domain/expense-receipt';
import type { ScanConfirmRepos } from './scan';

const alice = 'alice';
const groupId = 'group-1';

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
	const reader = stream.getReader();
	const chunks: Buffer[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(Buffer.from(value));
	}
	return Buffer.concat(chunks);
}

function bufferToStream(buf: Buffer): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array(buf));
			controller.close();
		}
	});
}

function fakeStorageBackend(): IFileStorageBackend & {
	store: Map<string, Buffer>;
	deletedKeys: string[];
} {
	const store = new Map<string, Buffer>();
	const deletedKeys: string[] = [];
	let nextKey = 0;
	return {
		store,
		deletedKeys,
		async put(stream) {
			const key = `key-${nextKey++}`;
			store.set(key, await streamToBuffer(stream));
			return { key };
		},
		async getReadUrl() {
			return null;
		},
		async getStream(key) {
			const buf = store.get(key);
			if (!buf) return new ReadableStream<Uint8Array>();
			return bufferToStream(buf);
		},
		async delete(key) {
			deletedKeys.push(key);
			store.delete(key);
		},
		async listKeys() {
			return Array.from(store.keys()).map((key) => ({ key, createdAt: new Date() }));
		}
	};
}

function fakeScanner(canned: ScanResult): IReceiptScanner & {
	calls: Array<{ mime: string; bytes: Buffer }>;
	shouldThrow: boolean;
} {
	const calls: Array<{ mime: string; bytes: Buffer }> = [];
	return {
		calls,
		shouldThrow: false,
		async scan(stream, mime) {
			calls.push({ mime, bytes: await streamToBuffer(stream) });
			if (this.shouldThrow) throw new ReceiptScannerError('scanner down');
			return canned;
		}
	};
}

function fakeGroupMemberRepo(
	member: boolean,
	members: Array<GroupMemberWithUser> = []
): IGroupMemberRepository {
	return {
		async getAllForGroupWithUser() {
			return members;
		},
		async create() {},
		async updateDefaultSplitPercents() {},
		async isMember() {
			return member;
		},
		async countByGroup() {
			return 0;
		},
		async remove() {},
		async getGroupIdsForUser() {
			return [];
		}
	};
}

function fakeUnitOfWork(repos: ScanConfirmRepos): IUnitOfWork<ScanConfirmRepos> {
	return {
		async run(fn) {
			return fn(repos);
		}
	};
}

function fakeConfirmExpenseRepo(): IExpenseRepository & {
	created: Array<ExpenseWithSplits>;
} {
	const created: Array<ExpenseWithSplits> = [];
	let nextId = 0;
	return {
		created,
		async create(input) {
			const id = `expense-${nextId++}`;
			const row: ExpenseWithSplits = {
				id,
				groupId: input.groupId,
				expenseGroupId: input.expenseGroupId,
				paidByUserId: input.paidByUserId,
				categoryId: input.categoryId,
				description: input.description,
				amountCents: input.amountCents,
				date: input.date,
				createdAt: new Date(),
				updatedAt: new Date(),
				splits: input.splits.map((split, index) => ({
					id: `split-${id}-${index}`,
					expenseId: id,
					userId: split.userId,
					amountCents: split.amountCents,
					createdAt: new Date()
				}))
			};
			created.push(row);
			return row;
		},
		async getWithSplits() {
			return null;
		},
		async update() {
			throw new Error('not implemented');
		},
		async delete() {},
		async countByExpenseGroup() {
			return 0;
		},
		async getAllForGroupWithSplits() {
			return created;
		},
		async getAllForGroupWithDetails() {
			return [];
		},
		async getAllForExpenseGroupWithDetails() {
			return [];
		}
	};
}

function fakeConfirmExpenseGroupRepo(): IExpenseGroupRepository & {
	created: Array<ExpenseGroup>;
} {
	const created: Array<ExpenseGroup> = [];
	let nextId = 0;
	return {
		created,
		async create(input: ExpenseGroupCreateInput) {
			const group: ExpenseGroup = {
				id: `expense-group-${nextId++}`,
				groupId: input.groupId,
				name: input.name ?? null,
				createdAt: new Date()
			};
			created.push(group);
			return group;
		},
		async getById() {
			return null;
		},
		async update(id, input) {
			return { id, groupId: '', name: input.name, createdAt: new Date() };
		},
		async delete() {}
	};
}

function fakeConfirmReceiptRepo(): IExpenseReceiptRepository & {
	created: Array<ExpenseReceipt>;
} {
	const created: Array<ExpenseReceipt> = [];
	let nextId = 0;
	return {
		created,
		async create(input) {
			const row: ExpenseReceipt = {
				id: `receipt-${nextId++}`,
				expenseGroupId: input.expenseGroupId,
				storageKey: input.storageKey,
				mime: input.mime,
				sizeBytes: input.sizeBytes,
				originalFilename: input.originalFilename,
				uploadedByUserId: input.uploadedByUserId,
				uploadedAt: new Date()
			};
			created.push(row);
			return row;
		},
		async getById() {
			return null;
		},
		async getAllForExpenseGroup() {
			return [];
		},
		async getAllStorageKeys() {
			return created.map((row) => row.storageKey);
		},
		async delete() {}
	};
}

function fakeConfirmPairBalanceRepo(): IPairBalanceRepository & {
	deltasApplied: Array<{
		groupId: string;
		fromUserId: string;
		toUserId: string;
		amountCents: number;
	}>;
} {
	const rows = new Map<string, { fromUserId: string; toUserId: string; amountCents: number }>();
	const deltasApplied: Array<{
		groupId: string;
		fromUserId: string;
		toUserId: string;
		amountCents: number;
	}> = [];
	const key = (a: string, b: string) => [a, b].sort().join('|');
	return {
		deltasApplied,
		async getForPair(_groupId, userA, userB) {
			return rows.get(key(userA, userB)) ?? null;
		},
		async replaceForPair(groupId, userA, userB, next) {
			if (next) {
				rows.set(key(userA, userB), next);
				deltasApplied.push({ groupId, ...next });
			} else {
				rows.delete(key(userA, userB));
			}
		},
		async getAllForGroup() {
			return [];
		},
		async getNetForUserInGroups() {
			return new Map();
		},
		async hasBalanceForUserInGroup() {
			return false;
		},
		async getDebtsForUser() {
			return [];
		},
		async getDebtsForUserInGroup() {
			return [];
		},
		async replaceAllForGroup() {}
	};
}

function fakeNormalizer(): IReceiptNormalizer & {
	calls: Array<{ bytes: Uint8Array; mime: string }>;
} {
	const calls: Array<{ bytes: Uint8Array; mime: string }> = [];
	return {
		calls,
		async normalize(bytes, mime): Promise<NormalizedReceipt> {
			calls.push({ bytes: Buffer.from(bytes), mime });
			if (mime === PDF_MIME) return { bytes: Buffer.from(bytes), mime: PDF_MIME };
			return { bytes: Buffer.from(bytes), mime: JPEG_MIME };
		}
	};
}

function service(
	opts: {
		member?: boolean;
		scanner?: ReturnType<typeof fakeScanner>;
		storage?: ReturnType<typeof fakeStorageBackend>;
		normalizer?: ReturnType<typeof fakeNormalizer>;
		confirmRepos?: ScanConfirmRepos;
		members?: Array<GroupMemberWithUser>;
		logger?: ILogger;
	} = {}
) {
	const storage = opts.storage ?? fakeStorageBackend();
	const normalizer = opts.normalizer ?? fakeNormalizer();
	const scanner =
		opts.scanner ?? fakeScanner({ lineItems: [{ description: 'Milk', amountDecimal: '1.00' }] });
	const expenseRepo = fakeConfirmExpenseRepo();
	const pairBalanceRepo = fakeConfirmPairBalanceRepo();
	const expenseGroupRepo = fakeConfirmExpenseGroupRepo();
	const receiptRepo = fakeConfirmReceiptRepo();
	const confirmRepos: ScanConfirmRepos = opts.confirmRepos ?? {
		expenseRepo,
		pairBalanceRepo,
		expenseGroupRepo,
		receiptRepo
	};
	const svc = createScanService({
		storageBackend: storage,
		normalizer,
		scanner,
		groupMemberRepo: fakeGroupMemberRepo(opts.member ?? true, opts.members ?? []),
		uow: fakeUnitOfWork(confirmRepos),
		logger: opts.logger
	});
	return {
		svc,
		storage,
		normalizer,
		scanner,
		expenseRepo,
		pairBalanceRepo,
		expenseGroupRepo,
		receiptRepo
	};
}

describe('createScanService.scan', () => {
	it('scans an image: normalizes to JPEG, stores bytes, feeds the stored stream to the scanner with the normalized mime', async () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0a]);
		const scanner = fakeScanner({ lineItems: [{ description: 'Bread', amountDecimal: '2.50' }] });
		const { svc, storage } = service({ scanner });

		const result = await svc.scan(alice, {
			groupId,
			bytes: png,
			sniffedMime: PNG_MIME,
			filename: 'r.png',
			sizeBytes: png.length
		});

		expect(result.scanResult.lineItems).toHaveLength(1);
		expect(result.storageKey).toBe(storage.store.keys().next().value);
		expect(scanner.calls).toHaveLength(1);
		expect(scanner.calls[0].mime).toBe(JPEG_MIME);
		expect(scanner.calls[0].bytes.equals(png)).toBe(true);
	});

	it('normalizes a PDF via the compressor, stores it, and feeds the stored PDF to the scanner', async () => {
		const pdf = Buffer.from('%PDF-1.4 ...');
		const scanner = fakeScanner({ lineItems: [{ description: 'Eggs', amountDecimal: '3.00' }] });
		const { svc } = service({ scanner });

		const result = await svc.scan(alice, {
			groupId,
			bytes: pdf,
			sniffedMime: PDF_MIME,
			filename: 'r.pdf',
			sizeBytes: pdf.length
		});

		expect(result.scanResult.lineItems[0].description).toBe('Eggs');
		expect(scanner.calls).toHaveLength(1);
		expect(scanner.calls[0].mime).toBe(PDF_MIME);
		expect(scanner.calls[0].bytes.equals(pdf)).toBe(true);
	});

	it('put-first: stores bytes before scanning and orphans them on scanner failure (no rollback)', async () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const scanner = fakeScanner({ lineItems: [] });
		scanner.shouldThrow = true;
		const { svc, storage } = service({ scanner });

		await expect(
			svc.scan(alice, {
				groupId,
				bytes: png,
				sniffedMime: PNG_MIME,
				sizeBytes: png.length
			})
		).rejects.toBeInstanceOf(ReceiptScannerError);

		expect(storage.store.size).toBe(1);
		expect(storage.deletedKeys).toHaveLength(0);
	});

	it('rejects a non-member before storing anything', async () => {
		const { svc, storage, scanner } = service({ member: false });

		await expect(
			svc.scan(alice, {
				groupId,
				bytes: Buffer.from([0x89, 0x50]),
				sniffedMime: PNG_MIME,
				sizeBytes: 2
			})
		).rejects.toBeInstanceOf(ReceiptNotAuthorizedError);

		expect(storage.store.size).toBe(0);
		expect(scanner.calls).toHaveLength(0);
	});

	it('rejects an oversized upload before storing anything', async () => {
		const { svc, storage } = service();

		await expect(
			svc.scan(alice, {
				groupId,
				bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
				sniffedMime: PNG_MIME,
				sizeBytes: MAX_RECEIPT_BYTES + 1
			})
		).rejects.toBeInstanceOf(ReceiptTooLargeError);

		expect(storage.store.size).toBe(0);
	});

	it('rejects a mime outside the scan allowlist before storing anything', async () => {
		const { svc, storage } = service();

		await expect(
			svc.scan(alice, {
				groupId,
				bytes: Buffer.from('GIF89a'),
				sniffedMime: 'image/gif',
				sizeBytes: 6
			})
		).rejects.toBeInstanceOf(ReceiptMimeNotAllowedError);

		expect(storage.store.size).toBe(0);
	});

	it('returns the storage metadata (normalized mime, normalized size, filename) for the client to echo back at confirm', async () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const { svc } = service();

		const result = await svc.scan(alice, {
			groupId,
			bytes: png,
			sniffedMime: PNG_MIME,
			filename: 'r.png',
			sizeBytes: png.length
		});

		expect(result.storageMeta).toEqual({
			mime: JPEG_MIME,
			sizeBytes: png.length,
			originalFilename: 'r.png'
		});
	});

	it('passes the normalized mime (not the sniffed one) to the scanner for an image', async () => {
		const heic = Buffer.from([0, 0, 0, 0x18, ...Buffer.from('ftypheic')]);
		const scanner = fakeScanner({
			lineItems: [{ description: 'Coffee', amountDecimal: '4.20' }]
		});
		const { svc } = service({ scanner });

		const result = await svc.scan(alice, {
			groupId,
			bytes: heic,
			sniffedMime: 'image/heic',
			filename: 'r.heic',
			sizeBytes: heic.length
		});

		expect(scanner.calls[0].mime).toBe(JPEG_MIME);
		expect(scanner.calls[0].bytes.equals(heic)).toBe(true);
		expect(result.scanResult.lineItems).toHaveLength(1);
		expect(result.scanResult.lineItems[0].description).toBe('Coffee');
	});

	it('stores the normalized artifact and not the original upload bytes', async () => {
		const original = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0a, 0x01, 0x02]);
		const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x07, 0xff, 0xd9]);
		const normalizer = fakeNormalizer();
		normalizer.normalize = vi.fn(async (bytes, mime) => {
			normalizer.calls.push({ bytes: Buffer.from(bytes), mime });
			return { bytes: jpeg, mime: JPEG_MIME };
		});
		const { svc, storage } = service({ normalizer });

		await svc.scan(alice, {
			groupId,
			bytes: original,
			sniffedMime: PNG_MIME,
			filename: 'r.png',
			sizeBytes: original.length
		});

		const stored = storage.store.get(storage.store.keys().next().value as string)!;
		expect(stored.equals(jpeg)).toBe(true);
		expect(stored.equals(original)).toBe(false);
	});

	it('emits the scan step sequence on the logger, correlated by scanId, with no receipt contents/usernames/filenames', async () => {
		const logger = createRecordingLogger();
		const { svc } = service({ logger });
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

		await svc.scan(alice, {
			groupId,
			bytes: png,
			sniffedMime: PNG_MIME,
			filename: 'r.png',
			sizeBytes: png.length
		});

		expect(logger.entries.map((e) => e.message)).toEqual([
			'receipt scan started',
			'receipt accepted',
			'normalize starting',
			'normalize done',
			'receipt stored',
			'receipt read-back',
			'scan starting',
			'scan done',
			'receipt scan complete'
		]);

		const forbidden = [
			'description',
			'merchant',
			'filename',
			'originalFilename',
			'displayName',
			'email'
		];
		for (const entry of logger.entries) {
			for (const key of forbidden) {
				expect(entry.fields).not.toHaveProperty(key);
			}
			expect(entry.fields).toHaveProperty('scanId');
			expect(entry.fields).toHaveProperty('groupId', groupId);
			expect(entry.fields).toHaveProperty('actorUserId', alice);
		}
	});
});

describe('createScanService.confirmDraft', () => {
	const alice = 'alice';
	const bob = 'bob';
	const groupId = 'group-1';
	const storageKey = 'stored-key';

	const members = [
		{ userId: alice, displayName: 'Alice', defaultSplitPercent: 50, avatarStorageKey: null },
		{ userId: bob, displayName: 'Bob', defaultSplitPercent: 50, avatarStorageKey: null }
	];

	function line(
		overrides: Partial<{
			description: string;
			amountDecimal: string;
			categoryId: string | null;
			date: string;
			percents: Record<string, string>;
		}> = {}
	) {
		return {
			description: 'Milk',
			amountDecimal: '10.00',
			categoryId: null,
			date: '2026-01-01',
			percents: { [alice]: '50', [bob]: '50' },
			...overrides
		};
	}

	function input(lines: ReturnType<typeof line>[]) {
		return {
			groupId,
			paidByUserId: alice,
			storageKey,
			storageMeta: { mime: PNG_MIME, sizeBytes: 99, originalFilename: 'r.png' },
			lines
		};
	}

	it('creates one ExpenseGroup, one child Expense per line with its splits, and links the existing storageKey as the receipt in one transaction', async () => {
		const { svc, expenseRepo, expenseGroupRepo, receiptRepo } = service({ members });

		const result = await svc.confirmDraft(alice, input([line(), line({ description: 'Bread' })]));

		expect(expenseGroupRepo.created).toHaveLength(1);
		expect(expenseGroupRepo.created[0].groupId).toBe(groupId);
		expect(result.expenseGroupId).toBe(expenseGroupRepo.created[0].id);

		expect(expenseRepo.created).toHaveLength(2);
		expect(expenseRepo.created.map((e) => e.description)).toEqual(['Milk', 'Bread']);
		for (const expense of expenseRepo.created) {
			expect(expense.expenseGroupId).toBe(result.expenseGroupId);
			expect(expense.groupId).toBe(groupId);
			expect(expense.paidByUserId).toBe(alice);
			expect(expense.amountCents).toBe(1000);
			expect(expense.splits).toHaveLength(2);
		}

		expect(receiptRepo.created).toHaveLength(1);
		expect(receiptRepo.created[0]).toMatchObject({
			expenseGroupId: result.expenseGroupId,
			storageKey,
			mime: PNG_MIME,
			sizeBytes: 99,
			originalFilename: 'r.png',
			uploadedByUserId: alice
		});
		expect(result.expenseIds).toEqual(expenseRepo.created.map((e) => e.id));
	});

	it('normalizes each line amountDecimal to integer cents (app, not scanner)', async () => {
		const { svc, expenseRepo } = service({ members });

		await svc.confirmDraft(alice, input([line({ amountDecimal: '3.49' })]));

		expect(expenseRepo.created[0].amountCents).toBe(349);
		expect(expenseRepo.created[0].splits.reduce((sum, s) => sum + s.amountCents, 0)).toBe(349);
	});

	it('updates PairBalance via the existing incremental-maintenance path for each child', async () => {
		const { svc, pairBalanceRepo } = service({ members });

		await svc.confirmDraft(alice, input([line(), line({ description: 'Bread' })]));

		// alice paid, bob owes 50% per line → two 500-cent deltas bob->alice, netted to one 1000.
		expect(pairBalanceRepo.deltasApplied).toEqual([
			{ groupId, fromUserId: bob, toUserId: alice, amountCents: 500 },
			{ groupId, fromUserId: bob, toUserId: alice, amountCents: 1000 }
		]);
	});

	it('does not put bytes again — links the existing storageKey as the receipt with no storageBackend.put', async () => {
		const storage = fakeStorageBackend();
		const { svc } = service({ members, storage });

		await svc.confirmDraft(alice, input([line()]));

		expect(storage.store.size).toBe(0);
	});

	it('rejects a non-member before writing anything', async () => {
		const { svc, expenseRepo, expenseGroupRepo, receiptRepo } = service({ member: false, members });

		await expect(svc.confirmDraft(alice, input([line()]))).rejects.toBeInstanceOf(
			ReceiptNotAuthorizedError
		);

		expect(expenseRepo.created).toHaveLength(0);
		expect(expenseGroupRepo.created).toHaveLength(0);
		expect(receiptRepo.created).toHaveLength(0);
	});

	it('rejects a payer who is not a member of the group', async () => {
		const { svc, expenseGroupRepo } = service({ members });

		await expect(
			svc.confirmDraft(alice, { ...input([line()]), paidByUserId: 'intruder' })
		).rejects.toThrow('Select who paid');

		expect(expenseGroupRepo.created).toHaveLength(0);
	});

	it('rejects an empty draft', async () => {
		const { svc, expenseGroupRepo } = service({ members });

		await expect(svc.confirmDraft(alice, input([]))).rejects.toThrow('Draft has no line items');
		expect(expenseGroupRepo.created).toHaveLength(0);
	});

	it('rejects a line with a non-positive amount', async () => {
		const { svc } = service({ members });

		await expect(svc.confirmDraft(alice, input([line({ amountDecimal: '0' })]))).rejects.toThrow(
			'Enter a valid amount'
		);
		await expect(
			svc.confirmDraft(alice, input([line({ amountDecimal: 'not-a-number' })]))
		).rejects.toThrow('Enter a valid amount');
	});

	it('falls back to the group default split when no custom percents are given', async () => {
		const { svc, expenseRepo } = service({ members });

		await svc.confirmDraft(alice, input([line({ percents: { [alice]: '', [bob]: '' } })]));

		const splits = expenseRepo.created[0].splits;
		expect(splits).toHaveLength(2);
		expect(splits.reduce((sum, s) => sum + s.amountCents, 0)).toBe(1000);
		expect(splits.find((s) => s.userId === alice)?.amountCents).toBe(500);
		expect(splits.find((s) => s.userId === bob)?.amountCents).toBe(500);
	});

	it('falls back to an equal split when no custom percents and no default split is configured', async () => {
		const noDefaults = [
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: null, avatarStorageKey: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null, avatarStorageKey: null }
		];
		const { svc, expenseRepo } = service({ members: noDefaults });

		await svc.confirmDraft(alice, input([line({ percents: { [alice]: '', [bob]: '' } })]));

		const splits = expenseRepo.created[0].splits;
		expect(splits).toHaveLength(2);
		expect(splits.map((s) => s.amountCents)).toEqual([500, 500]);
	});

	it('normalizes categoryId: empty/none becomes null', async () => {
		const { svc, expenseRepo } = service({ members });

		await svc.confirmDraft(alice, input([line({ categoryId: 'none' }), line({ categoryId: '' })]));

		expect(expenseRepo.created.map((e) => e.categoryId)).toEqual([null, null]);
	});

	it('emits the confirm step sequence on the logger with no receipt contents/usernames', async () => {
		const logger = createRecordingLogger();
		const { svc } = service({ members, logger });

		await svc.confirmDraft(alice, input([line(), line({ description: 'Bread' })]));

		expect(logger.entries.map((e) => e.message)).toEqual([
			'draft confirm started',
			'expense group created',
			'expense created',
			'expense created',
			'receipt linked',
			'draft confirm complete'
		]);

		const forbidden = [
			'description',
			'merchant',
			'filename',
			'originalFilename',
			'displayName',
			'email'
		];
		for (const entry of logger.entries) {
			for (const key of forbidden) {
				expect(entry.fields).not.toHaveProperty(key);
			}
			expect(entry.fields).toHaveProperty('groupId', groupId);
			expect(entry.fields).toHaveProperty('actorUserId', alice);
			expect(entry.fields).toHaveProperty('paidByUserId', alice);
		}
		expect(logger.entries.find((e) => e.message === 'expense created')?.fields).toHaveProperty(
			'amountCents',
			1000
		);
	});
});
