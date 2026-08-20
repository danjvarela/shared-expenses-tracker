import { describe, it, expect, vi } from 'vitest';
import type { IExpenseReceiptRepository } from '$lib/server/app/interfaces/repositories/expense-receipt';
import type {
	IExpenseRepository,
	ExpenseWithSplitsAndNames
} from '$lib/server/app/interfaces/repositories/expense';
import type { IExpenseGroupRepository } from '$lib/server/app/interfaces/repositories/expense-group';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IReceiptStorageBackend } from '$lib/server/app/interfaces/receipt-storage';
import type { ExpenseReceipt } from '$lib/server/domain/expense-receipt';
import {
	createReceiptService,
	ReceiptNotAuthorizedError,
	ReceiptTooLargeError,
	ReceiptMimeNotAllowedError,
	ReceiptNotFoundError,
	MAX_RECEIPT_BYTES,
	ALLOWED_RECEIPT_MIMES
} from './receipt';
import { ExpenseGroupNotFoundError } from './expense';

const alice = 'alice';
const groupId = 'group-1';
const expenseId = 'expense-1';
const expenseGroupId = 'expense-group-1';

function fakeExpenseRepo(seed: Array<ExpenseWithSplitsAndNames> = []): IExpenseRepository {
	const rows = new Map(seed.map((row) => [row.id, row]));
	return {
		async getWithSplits(id) {
			return rows.get(id) ?? null;
		},
		async create() {
			throw new Error('not implemented');
		},
		async update() {
			throw new Error('not implemented');
		},
		async delete() {},
		async countByExpenseGroup() {
			return 0;
		},
		async getAllForGroupWithSplits() {
			return [];
		},
		async getAllForGroupWithDetails() {
			return [];
		}
	};
}

function fakeExpenseGroupRepo(missing = false): IExpenseGroupRepository {
	return {
		async create() {
			throw new Error('not implemented');
		},
		async getById(id) {
			if (missing) return null;
			return { id, groupId, createdAt: new Date() };
		},
		async delete() {}
	};
}

function expenseRow(): ExpenseWithSplitsAndNames {
	return {
		id: expenseId,
		groupId,
		expenseGroupId,
		paidByUserId: alice,
		categoryId: null,
		description: 'Dinner',
		amountCents: 1000,
		date: new Date(),
		createdAt: new Date(),
		updatedAt: new Date(),
		paidByName: 'Alice',
		splits: []
	};
}

function fakeGroupMemberRepo(member: boolean): IGroupMemberRepository {
	return {
		async getAllForGroupWithUser() {
			return [];
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

function fakeReceiptRepo(): IExpenseReceiptRepository & {
	rows: Map<string, ExpenseReceipt>;
	created: Array<ExpenseReceipt>;
	deleted: Array<string>;
	shouldThrowOnCreate: boolean;
} {
	const rows = new Map<string, ExpenseReceipt>();
	const created: Array<ExpenseReceipt> = [];
	const deleted: Array<string> = [];
	let nextId = 0;
	return {
		rows,
		created,
		deleted,
		shouldThrowOnCreate: false,
		async create(input) {
			if (this.shouldThrowOnCreate) throw new Error('repo create failed');
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
			rows.set(row.id, row);
			created.push(row);
			return row;
		},
		async getById(id) {
			return rows.get(id) ?? null;
		},
		async getAllForExpenseGroup() {
			return Array.from(rows.values());
		},
		async delete(id) {
			deleted.push(id);
			rows.delete(id);
		}
	};
}

function fakeStorageBackend(): IReceiptStorageBackend & {
	putKeys: Array<string>;
	deletedKeys: Array<string>;
	streams: Map<string, ReadableStream<Uint8Array>>;
	shouldThrowOnPut: boolean;
} {
	const putKeys: Array<string> = [];
	const deletedKeys: Array<string> = [];
	const streams = new Map<string, ReadableStream<Uint8Array>>();
	let nextKey = 0;
	return {
		putKeys,
		deletedKeys,
		streams,
		shouldThrowOnPut: false,
		async put(stream) {
			if (this.shouldThrowOnPut) throw new Error('put failed');
			const key = `key-${nextKey++}`;
			putKeys.push(key);
			streams.set(key, stream);
			return { key };
		},
		async getReadUrl() {
			return null;
		},
		async getStream(key) {
			return streams.get(key) ?? new ReadableStream<Uint8Array>();
		},
		async delete(key) {
			deletedKeys.push(key);
			streams.delete(key);
		}
	};
}

function makeStream(): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array([1, 2, 3]));
			controller.close();
		}
	});
}

function service(opts: {
	member?: boolean;
	expense?: boolean;
	expenseGroup?: boolean;
	storage?: ReturnType<typeof fakeStorageBackend>;
	receipt?: ReturnType<typeof fakeReceiptRepo>;
	shouldThrowOnCreate?: boolean;
}) {
	const storage = opts.storage ?? fakeStorageBackend();
	const receipt = opts.receipt ?? fakeReceiptRepo();
	if (opts.shouldThrowOnCreate !== undefined)
		receipt.shouldThrowOnCreate = opts.shouldThrowOnCreate;
	const svc = createReceiptService({
		receiptRepo: receipt,
		storageBackend: storage,
		expenseRepo: fakeExpenseRepo(opts.expense === false ? [] : [expenseRow()]),
		expenseGroupRepo: fakeExpenseGroupRepo(opts.expenseGroup === false),
		groupMemberRepo: fakeGroupMemberRepo(opts.member ?? true)
	});
	return { svc, storage, receipt };
}

describe('createReceiptService.createReceipt', () => {
	it('puts bytes first then creates the row, returning the receipt', async () => {
		const { svc, storage, receipt } = service({});

		const created = await svc.createReceipt(alice, {
			expenseId,
			stream: makeStream(),
			mime: 'image/png',
			filename: 'receipt.png',
			sizeBytes: 3
		});

		expect(created.storageKey).toBe(storage.putKeys[0]);
		expect(receipt.created).toHaveLength(1);
		expect(receipt.created[0].storageKey).toBe(storage.putKeys[0]);
		expect(receipt.created[0].originalFilename).toBe('receipt.png');
		expect(storage.deletedKeys).toHaveLength(0);
	});

	it('rejects a non-member', async () => {
		const { svc, storage, receipt } = service({ member: false });

		await expect(
			svc.createReceipt(alice, {
				expenseId,
				stream: makeStream(),
				mime: 'image/png',
				filename: 'r.png',
				sizeBytes: 3
			})
		).rejects.toBeInstanceOf(ReceiptNotAuthorizedError);

		expect(storage.putKeys).toHaveLength(0);
		expect(receipt.created).toHaveLength(0);
	});

	it('throws ExpenseNotFoundError when the expense does not exist', async () => {
		const { svc, storage } = service({ expense: false });

		await expect(
			svc.createReceipt(alice, {
				expenseId,
				stream: makeStream(),
				mime: 'image/png',
				filename: 'r.png',
				sizeBytes: 3
			})
		).rejects.toThrow('Expense not found');

		expect(storage.putKeys).toHaveLength(0);
	});

	it('rejects an oversized file', async () => {
		const { svc, storage, receipt } = service({});

		await expect(
			svc.createReceipt(alice, {
				expenseId,
				stream: makeStream(),
				mime: 'image/png',
				filename: 'r.png',
				sizeBytes: MAX_RECEIPT_BYTES + 1
			})
		).rejects.toBeInstanceOf(ReceiptTooLargeError);

		expect(storage.putKeys).toHaveLength(0);
		expect(receipt.created).toHaveLength(0);
	});

	it('rejects a mime not in the allowlist', async () => {
		const { svc, storage, receipt } = service({});

		await expect(
			svc.createReceipt(alice, {
				expenseId,
				stream: makeStream(),
				mime: 'text/plain',
				filename: 'r.txt',
				sizeBytes: 3
			})
		).rejects.toBeInstanceOf(ReceiptMimeNotAllowedError);

		expect(storage.putKeys).toHaveLength(0);
		expect(receipt.created).toHaveLength(0);
	});

	it('rolls back the stored bytes when the repo create throws', async () => {
		const { svc, storage } = service({ shouldThrowOnCreate: true });

		await expect(
			svc.createReceipt(alice, {
				expenseId,
				stream: makeStream(),
				mime: 'image/png',
				filename: 'r.png',
				sizeBytes: 3
			})
		).rejects.toThrow('repo create failed');

		expect(storage.putKeys).toHaveLength(1);
		expect(storage.deletedKeys).toEqual([storage.putKeys[0]]);
	});

	it('continues (best-effort) when the rollback delete itself fails', async () => {
		const storage = fakeStorageBackend();
		storage.delete = vi.fn(async () => {
			throw new Error('delete failed');
		});
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { svc } = service({ storage, shouldThrowOnCreate: true });

		await expect(
			svc.createReceipt(alice, {
				expenseId,
				stream: makeStream(),
				mime: 'image/png',
				filename: 'r.png',
				sizeBytes: 3
			})
		).rejects.toThrow('repo create failed');

		expect(storage.delete).toHaveBeenCalledWith(storage.putKeys[0]);
		consoleSpy.mockRestore();
	});

	it('strips path components from the filename', async () => {
		const { svc, receipt } = service({});

		await svc.createReceipt(alice, {
			expenseId,
			stream: makeStream(),
			mime: 'image/png',
			filename: '/etc/passwd/../../receipt.png',
			sizeBytes: 3
		});

		expect(receipt.created[0].originalFilename).toBe('receipt.png');
	});

	it('nulls the filename when none is provided', async () => {
		const { svc, receipt } = service({});

		await svc.createReceipt(alice, {
			expenseId,
			stream: makeStream(),
			mime: 'image/png',
			sizeBytes: 3
		});

		expect(receipt.created[0].originalFilename).toBeNull();
	});

	it('accepts every mime in the allowlist', async () => {
		for (const mime of ALLOWED_RECEIPT_MIMES) {
			const { svc, receipt } = service({});
			await svc.createReceipt(alice, {
				expenseId,
				stream: makeStream(),
				mime,
				filename: 'r',
				sizeBytes: 3
			});
			expect(receipt.created).toHaveLength(1);
		}
	});

	it('accepts a pdf receipt', async () => {
		const { svc, receipt } = service({});

		const created = await svc.createReceipt(alice, {
			expenseId,
			stream: makeStream(),
			mime: 'application/pdf',
			filename: 'receipt.pdf',
			sizeBytes: 3
		});

		expect(created.mime).toBe('application/pdf');
		expect(created.originalFilename).toBe('receipt.pdf');
		expect(receipt.created).toHaveLength(1);
	});

	it('still accepts every image mime alongside pdf', async () => {
		const imageMimes = [...ALLOWED_RECEIPT_MIMES].filter((m) => m !== 'application/pdf');
		for (const mime of imageMimes) {
			const { svc, receipt } = service({});
			await svc.createReceipt(alice, {
				expenseId,
				stream: makeStream(),
				mime,
				filename: 'r',
				sizeBytes: 3
			});
			expect(receipt.created).toHaveLength(1);
		}
	});
});

describe('createReceiptService.getReceiptsForExpense', () => {
	it('returns the receipts for the expense when the actor is a member', async () => {
		const receipt = fakeReceiptRepo();
		const { svc } = service({ receipt });

		await svc.createReceipt(alice, {
			expenseId,
			stream: makeStream(),
			mime: 'image/png',
			filename: 'r.png',
			sizeBytes: 3
		});

		expect(await svc.getReceiptsForExpense(alice, expenseId)).toHaveLength(1);
	});

	it('rejects a non-member', async () => {
		const { svc } = service({ member: false });

		await expect(svc.getReceiptsForExpense(alice, expenseId)).rejects.toBeInstanceOf(
			ReceiptNotAuthorizedError
		);
	});

	it('throws when the expense does not exist', async () => {
		const { svc } = service({ expense: false });

		await expect(svc.getReceiptsForExpense(alice, expenseId)).rejects.toThrow('Expense not found');
	});
});

describe('createReceiptService.getReadAccess', () => {
	it('returns a stream when the backend cannot presign', async () => {
		const receipt = fakeReceiptRepo();
		const created = await service({ receipt }).svc.createReceipt(alice, {
			expenseId,
			stream: makeStream(),
			mime: 'image/png',
			filename: 'r.png',
			sizeBytes: 3
		});

		const { svc } = service({ receipt });

		const access = await svc.getReadAccess(alice, created.id);
		if (!('stream' in access)) throw new Error('expected stream access');
		expect(access.mime).toBe('image/png');
		expect(access.storageKey).toBe(created.storageKey);
	});

	it('returns a url when the backend can presign', async () => {
		const storage = fakeStorageBackend();
		storage.getReadUrl = vi.fn(async () => 'https://example.com/presigned');
		const receipt = fakeReceiptRepo();
		const created = await service({ storage, receipt }).svc.createReceipt(alice, {
			expenseId,
			stream: makeStream(),
			mime: 'image/jpeg',
			filename: 'r.jpg',
			sizeBytes: 3
		});

		const { svc } = service({ storage, receipt });
		const access = await svc.getReadAccess(alice, created.id);
		if (!('url' in access)) throw new Error('expected url access');
		expect(access.url).toBe('https://example.com/presigned');
		expect(access.mime).toBe('image/jpeg');
		expect(access.storageKey).toBe(created.storageKey);
	});

	it('throws ReceiptNotFoundError when the receipt does not exist', async () => {
		const { svc } = service({});

		await expect(svc.getReadAccess(alice, 'missing')).rejects.toBeInstanceOf(ReceiptNotFoundError);
	});

	it('rejects a non-member', async () => {
		const receipt = fakeReceiptRepo();
		const created = await service({ receipt }).svc.createReceipt(alice, {
			expenseId,
			stream: makeStream(),
			mime: 'image/png',
			filename: 'r.png',
			sizeBytes: 3
		});

		const { svc } = service({ receipt, member: false });

		await expect(svc.getReadAccess(alice, created.id)).rejects.toBeInstanceOf(
			ReceiptNotAuthorizedError
		);
	});
});

describe('createReceiptService.deleteReceipt', () => {
	async function makeReceipt(opts: { storage?: ReturnType<typeof fakeStorageBackend> } = {}) {
		const receipt = fakeReceiptRepo();
		const created = await service({ receipt, storage: opts.storage }).svc.createReceipt(alice, {
			expenseId,
			stream: makeStream(),
			mime: 'image/png',
			filename: 'r.png',
			sizeBytes: 3
		});
		return { receipt, created };
	}

	it('deletes the row first then the bytes', async () => {
		const { receipt, created } = await makeReceipt();
		const storage = fakeStorageBackend();
		const { svc } = service({ receipt, storage });

		await svc.deleteReceipt(alice, created.id);

		expect(receipt.deleted).toEqual([created.id]);
		expect(storage.deletedKeys).toEqual([created.storageKey]);
	});

	it('never touches the bytes if the row delete fails (row-first)', async () => {
		const storage = fakeStorageBackend();
		storage.delete = vi.fn(async () => {});
		const { receipt, created } = await makeReceipt({ storage });
		receipt.delete = vi.fn(async () => {
			throw new Error('repo delete failed');
		});
		const { svc } = service({ receipt, storage });

		await expect(svc.deleteReceipt(alice, created.id)).rejects.toThrow('repo delete failed');

		expect(receipt.delete).toHaveBeenCalledWith(created.id);
		expect(storage.delete).not.toHaveBeenCalled();
	});

	it('is idempotent: a missing row is a success, not a 404', async () => {
		const { svc, receipt, storage } = service({});

		await expect(svc.deleteReceipt(alice, 'does-not-exist')).resolves.toBeUndefined();

		expect(receipt.deleted).toHaveLength(0);
		expect(storage.deletedKeys).toHaveLength(0);
	});

	it('orphans the bytes when the adapter delete fails (logs, does not throw)', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const storage = fakeStorageBackend();
		storage.delete = vi.fn(async () => {
			throw new Error('adapter delete failed');
		});
		const { receipt, created } = await makeReceipt({ storage });
		const { svc } = service({ receipt, storage });

		await expect(svc.deleteReceipt(alice, created.id)).resolves.toBeUndefined();

		expect(receipt.deleted).toEqual([created.id]);
		expect(storage.delete).toHaveBeenCalledWith(created.storageKey);
		consoleSpy.mockRestore();
	});

	it('rejects a non-member and deletes nothing', async () => {
		const { receipt, created } = await makeReceipt();
		const storage = fakeStorageBackend();
		const { svc } = service({ receipt, storage, member: false });

		await expect(svc.deleteReceipt(alice, created.id)).rejects.toBeInstanceOf(
			ReceiptNotAuthorizedError
		);

		expect(receipt.deleted).toHaveLength(0);
		expect(storage.deletedKeys).toHaveLength(0);
	});

	it('deletes nothing when the expense group no longer exists', async () => {
		const { receipt, created } = await makeReceipt();
		const storage = fakeStorageBackend();
		const { svc } = service({ receipt, storage, expenseGroup: false });

		await expect(svc.deleteReceipt(alice, created.id)).rejects.toBeInstanceOf(
			ExpenseGroupNotFoundError
		);

		expect(receipt.deleted).toHaveLength(0);
		expect(storage.deletedKeys).toHaveLength(0);
	});
});
