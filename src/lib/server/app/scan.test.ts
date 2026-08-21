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

function service(
	opts: {
		member?: boolean;
		scanner?: ReturnType<typeof fakeScanner>;
		rasterizer?: ReturnType<typeof fakeRasterizer>;
		storage?: ReturnType<typeof fakeStorageBackend>;
	} = {}
) {
	const storage = opts.storage ?? fakeStorageBackend();
	const scanner =
		opts.scanner ?? fakeScanner({ lineItems: [{ description: 'Milk', amountDecimal: '1.00' }] });
	const rasterizer = opts.rasterizer ?? fakeRasterizer(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 1);
	const svc = createScanService({
		storageBackend: storage,
		scanner,
		groupMemberRepo: fakeGroupMemberRepo(opts.member ?? true),
		rasterizer
	});
	return { svc, storage, scanner, rasterizer };
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
			rasterizer
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
			rasterizer
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
