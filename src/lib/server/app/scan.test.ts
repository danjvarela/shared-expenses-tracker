import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScanService, sniffMime, PDF_MIME, PNG_MIME, JPEG_MIME } from './scan';
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
import {
	ReceiptRasterizeError,
	type IPdfRasterizer
} from '$lib/server/app/interfaces/pdf-rasterizer';
import type { IReceiptStorageBackend } from '$lib/server/app/interfaces/receipt-storage';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
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
import type { ExpenseGroup } from '$lib/server/domain/expense-group';
import type { ExpenseReceipt } from '$lib/server/domain/expense-receipt';
import type { ScanConfirmRepos } from './scan';
import { createPopplerPdfRasterizer } from '$lib/server/infra/pdf-rasterizer';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PNG = resolve(here, '../infra/receipt-scanner/fixtures/receipt.png');

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

function fakeStorageBackend(): IReceiptStorageBackend & {
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

function fakeRasterizer(
	image: Buffer,
	pageCount: number
): IPdfRasterizer & {
	calls: Buffer[];
	pageCountOverride: number;
} {
	const calls: Buffer[] = [];
	return {
		calls,
		pageCountOverride: pageCount,
		async rasterizeFirstPage(stream) {
			calls.push(await streamToBuffer(stream));
			return { image, pageCount: this.pageCountOverride };
		}
	};
}

function fakeGroupMemberRepo(
	member: boolean,
	members: Array<{ userId: string; displayName: string; defaultSplitPercent: number | null }> = []
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
		async remove() {}
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
				createdAt: new Date()
			};
			created.push(group);
			return group;
		},
		async getById() {
			return null;
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

function service(
	opts: {
		member?: boolean;
		scanner?: ReturnType<typeof fakeScanner>;
		rasterizer?: ReturnType<typeof fakeRasterizer>;
		storage?: ReturnType<typeof fakeStorageBackend>;
		confirmRepos?: ScanConfirmRepos;
		members?: Array<{ userId: string; displayName: string; defaultSplitPercent: number | null }>;
	} = {}
) {
	const storage = opts.storage ?? fakeStorageBackend();
	const scanner =
		opts.scanner ?? fakeScanner({ lineItems: [{ description: 'Milk', amountDecimal: '1.00' }] });
	const rasterizer = opts.rasterizer ?? fakeRasterizer(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 1);
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
		scanner,
		groupMemberRepo: fakeGroupMemberRepo(opts.member ?? true, opts.members ?? []),
		rasterizer,
		uow: fakeUnitOfWork(confirmRepos)
	});
	return {
		svc,
		storage,
		scanner,
		rasterizer,
		expenseRepo,
		pairBalanceRepo,
		expenseGroupRepo,
		receiptRepo
	};
}

describe('sniffMime', () => {
	it('detects a PDF by the %PDF- magic', () => {
		expect(sniffMime(new Uint8Array(Buffer.from('%PDF-1.4 ...')))).toBe(PDF_MIME);
	});

	it('detects a PNG by its 8-byte signature', () => {
		expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe(
			PNG_MIME
		);
	});

	it('detects a JPEG by the FFD8FF magic', () => {
		expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe(JPEG_MIME);
	});

	it('returns null for an unsupported type', () => {
		expect(sniffMime(new Uint8Array(Buffer.from('GIF89a')))).toBeNull();
		expect(sniffMime(new Uint8Array([0x42, 0x4d]))).toBeNull();
	});

	it('returns null for too few bytes', () => {
		expect(sniffMime(new Uint8Array([0x89, 0x50]))).toBeNull();
	});

	it('ignores a spoofed Content-Type — a PNG body with no PNG magic is not PNG', () => {
		expect(sniffMime(new Uint8Array(Buffer.from('not an image')))).toBeNull();
	});
});

describe('createScanService.scan', () => {
	it('scans an image directly: stores bytes, feeds the stored stream to the scanner', async () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0a]);
		const scanner = fakeScanner({ lineItems: [{ description: 'Bread', amountDecimal: '2.50' }] });
		const { svc, storage, rasterizer } = service({ scanner });

		const result = await svc.scan(alice, {
			groupId,
			stream: bufferToStream(png),
			sniffedMime: PNG_MIME,
			filename: 'r.png',
			sizeBytes: png.length
		});

		expect(result.scanResult.lineItems).toHaveLength(1);
		expect(result.storageKey).toBe(storage.store.keys().next().value);
		expect(scanner.calls).toHaveLength(1);
		expect(scanner.calls[0].mime).toBe(PNG_MIME);
		expect(scanner.calls[0].bytes.equals(png)).toBe(true);
		expect(rasterizer.calls).toHaveLength(0);
	});

	it('scans a PDF by rasterizing page 1 and feeding the image to the scanner', async () => {
		const rasterized = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
		const scanner = fakeScanner({ lineItems: [{ description: 'Eggs', amountDecimal: '3.00' }] });
		const rasterizer = fakeRasterizer(rasterized, 1);
		const { svc } = service({ scanner, rasterizer });

		const result = await svc.scan(alice, {
			groupId,
			stream: bufferToStream(Buffer.from('%PDF-1.4 ...')),
			sniffedMime: PDF_MIME,
			filename: 'r.pdf',
			sizeBytes: 12
		});

		expect(result.scanResult.lineItems[0].description).toBe('Eggs');
		expect(rasterizer.calls).toHaveLength(1);
		expect(scanner.calls).toHaveLength(1);
		expect(scanner.calls[0].mime).toBe(PNG_MIME);
		expect(scanner.calls[0].bytes.equals(rasterized)).toBe(true);
	});

	it('rejects a multi-page PDF with a clear ReceiptRasterizeError and does not scan', async () => {
		const rasterizer = fakeRasterizer(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 3);
		const scanner = fakeScanner({ lineItems: [] });
		const { svc } = service({ scanner, rasterizer });

		await expect(
			svc.scan(alice, {
				groupId,
				stream: bufferToStream(Buffer.from('%PDF-1.4')),
				sniffedMime: PDF_MIME,
				sizeBytes: 8
			})
		).rejects.toBeInstanceOf(ReceiptRasterizeError);

		expect(scanner.calls).toHaveLength(0);
	});

	it('put-first: stores bytes before scanning and orphans them on scanner failure (no rollback)', async () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const scanner = fakeScanner({ lineItems: [] });
		scanner.shouldThrow = true;
		const { svc, storage } = service({ scanner });

		await expect(
			svc.scan(alice, {
				groupId,
				stream: bufferToStream(png),
				sniffedMime: PNG_MIME,
				sizeBytes: png.length
			})
		).rejects.toBeInstanceOf(ReceiptScannerError);

		expect(storage.store.size).toBe(1);
		expect(storage.deletedKeys).toHaveLength(0);
	});

	it('rejects a non-member before storing anything', async () => {
		const { svc, storage, scanner, rasterizer } = service({ member: false });

		await expect(
			svc.scan(alice, {
				groupId,
				stream: bufferToStream(Buffer.from([0x89, 0x50])),
				sniffedMime: PNG_MIME,
				sizeBytes: 2
			})
		).rejects.toBeInstanceOf(ReceiptNotAuthorizedError);

		expect(storage.store.size).toBe(0);
		expect(scanner.calls).toHaveLength(0);
		expect(rasterizer.calls).toHaveLength(0);
	});

	it('rejects an oversized upload before storing anything', async () => {
		const { svc, storage } = service();

		await expect(
			svc.scan(alice, {
				groupId,
				stream: bufferToStream(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
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
				stream: bufferToStream(Buffer.from('GIF89a')),
				sniffedMime: 'image/gif',
				sizeBytes: 6
			})
		).rejects.toBeInstanceOf(ReceiptMimeNotAllowedError);

		expect(storage.store.size).toBe(0);
	});

	it('rasterize failure (corrupt PDF) leaves the stored bytes orphaned (no rollback)', async () => {
		const rasterizer = fakeRasterizer(Buffer.alloc(0), 0);
		rasterizer.rasterizeFirstPage = vi.fn(async () => {
			throw new ReceiptRasterizeError();
		});
		const scanner = fakeScanner({ lineItems: [] });
		const { svc, storage } = service({ scanner, rasterizer });

		await expect(
			svc.scan(alice, {
				groupId,
				stream: bufferToStream(Buffer.from('%PDF-1.4')),
				sniffedMime: PDF_MIME,
				sizeBytes: 8
			})
		).rejects.toBeInstanceOf(ReceiptRasterizeError);

		expect(storage.store.size).toBe(1);
		expect(storage.deletedKeys).toHaveLength(0);
		expect(scanner.calls).toHaveLength(0);
	});

	it('returns the storage metadata (sniffed mime, size, filename) for the client to echo back at confirm', async () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const { svc } = service();

		const result = await svc.scan(alice, {
			groupId,
			stream: bufferToStream(png),
			sniffedMime: PNG_MIME,
			filename: 'r.png',
			sizeBytes: png.length
		});

		expect(result.storageMeta).toEqual({
			mime: PNG_MIME,
			sizeBytes: png.length,
			originalFilename: 'r.png'
		});
	});
});

describe('createScanService.confirmDraft', () => {
	const alice = 'alice';
	const bob = 'bob';
	const groupId = 'group-1';
	const storageKey = 'stored-key';

	const members = [
		{ userId: alice, displayName: 'Alice', defaultSplitPercent: 50 },
		{ userId: bob, displayName: 'Bob', defaultSplitPercent: 50 }
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
			{ userId: alice, displayName: 'Alice', defaultSplitPercent: null },
			{ userId: bob, displayName: 'Bob', defaultSplitPercent: null }
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
});

// Real-poppler end-to-end (no UI): a fixture image and a generated single-page
// PDF both flow through the service and return the scanner's line items.
// Skipped when poppler (pdfinfo) is not on PATH.
const hasPoppler = (() => {
	const r = spawnSync('pdfinfo', ['-v'], { stdio: 'ignore' });
	return r.error === undefined;
})();

function buildPdf(pageCount: number): Buffer {
	const objects: string[] = [];
	objects.push('<</Type/Catalog/Pages 2 0 R>>');
	const kids = Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(' ');
	objects.push(`<</Type/Pages/Kids[${kids}]/Count ${pageCount}>>`);
	for (let i = 0; i < pageCount; i++) {
		objects.push('<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>');
	}

	let body = '%PDF-1.4\n';
	const offsets: number[] = [];
	objects.forEach((obj, idx) => {
		offsets.push(Buffer.byteLength(body, 'latin1'));
		body += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
	});
	const xrefStart = Buffer.byteLength(body, 'latin1');
	body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
	body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
	return Buffer.from(body, 'latin1');
}

describe.skipIf(!hasPoppler)('scanService end-to-end with real poppler', () => {
	it('scans a fixture receipt image into line items', async () => {
		const bytes = await readFile(FIXTURE_PNG);
		const canned: ScanResult = { lineItems: [{ description: 'Coffee', amountDecimal: '4.20' }] };
		const scanner = fakeScanner(canned);
		const { svc, storage } = service({ scanner });

		const result = await svc.scan(alice, {
			groupId,
			stream: bufferToStream(bytes),
			sniffedMime: PNG_MIME,
			filename: 'receipt.png',
			sizeBytes: bytes.length
		});

		expect(result.scanResult.lineItems).toEqual(canned.lineItems);
		expect(scanner.calls[0].bytes.equals(bytes)).toBe(true);
		expect(storage.store.size).toBe(1);
	});

	it('rasterizes a generated single-page PDF and scans the image', async () => {
		const pdf = buildPdf(1);
		const canned: ScanResult = { lineItems: [{ description: 'Tea', amountDecimal: '1.10' }] };
		const scanner = fakeScanner(canned);
		const rasterizer = createPopplerPdfRasterizer();
		const svc = createScanService({
			storageBackend: fakeStorageBackend(),
			scanner,
			groupMemberRepo: fakeGroupMemberRepo(true),
			rasterizer,
			uow: fakeUnitOfWork({
				expenseRepo: fakeConfirmExpenseRepo(),
				pairBalanceRepo: fakeConfirmPairBalanceRepo(),
				expenseGroupRepo: fakeConfirmExpenseGroupRepo(),
				receiptRepo: fakeConfirmReceiptRepo()
			})
		});

		const result = await svc.scan(alice, {
			groupId,
			stream: bufferToStream(pdf),
			sniffedMime: PDF_MIME,
			filename: 'receipt.pdf',
			sizeBytes: pdf.length
		});

		expect(result.scanResult.lineItems).toEqual(canned.lineItems);
		expect(scanner.calls).toHaveLength(1);
		expect(scanner.calls[0].mime).toBe(PNG_MIME);
		expect(scanner.calls[0].bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	});

	it('rejects a generated multi-page PDF with a ReceiptRasterizeError', async () => {
		const pdf = buildPdf(2);
		const scanner = fakeScanner({ lineItems: [] });
		const rasterizer = createPopplerPdfRasterizer();
		const svc = createScanService({
			storageBackend: fakeStorageBackend(),
			scanner,
			groupMemberRepo: fakeGroupMemberRepo(true),
			rasterizer,
			uow: fakeUnitOfWork({
				expenseRepo: fakeConfirmExpenseRepo(),
				pairBalanceRepo: fakeConfirmPairBalanceRepo(),
				expenseGroupRepo: fakeConfirmExpenseGroupRepo(),
				receiptRepo: fakeConfirmReceiptRepo()
			})
		});

		await expect(
			svc.scan(alice, {
				groupId,
				stream: bufferToStream(pdf),
				sniffedMime: PDF_MIME,
				sizeBytes: pdf.length
			})
		).rejects.toBeInstanceOf(ReceiptRasterizeError);
		expect(scanner.calls).toHaveLength(0);
	});
});
