import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { createReceiptNormalizer } from './receipt-normalizer';
import { JPEG_MIME, PDF_MIME, PNG_MIME, HEIC_MIME } from '$lib/server/app/receipt-format';
import { ReceiptNormalizeError } from '$lib/server/app/interfaces/receipt-normalizer';
import { ReceiptPdfCompressError } from './pdf';
import type { IPdfProcessor } from './pdf';

class FakePipe extends EventEmitter {
	push(chunk: string | Buffer | null) {
		if (chunk === null) this.emit('end');
		else this.emit('data', Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
}

interface FakeProc extends EventEmitter {
	stdin: Writable;
	stdout: FakePipe;
	stderr: FakePipe;
}

function makeProc(): FakeProc {
	const proc = new EventEmitter() as FakeProc;
	proc.stdin = new Writable({
		write(_chunk, _enc, cb) {
			cb();
		}
	});
	proc.stdout = new FakePipe();
	proc.stderr = new FakePipe();
	return proc;
}

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const COMPRESSED_PDF = Buffer.from('%PDF-1.4\ncompressed-body\n');

function fakePdfProcessor(compress: IPdfProcessor['compress']): IPdfProcessor {
	return {
		compress,
		async countPages() {
			return 1;
		},
		async rasterizeFirstPage() {
			return { image: Buffer.alloc(0), pageCount: 1 };
		}
	};
}

describe('createReceiptNormalizer.normalize', () => {
	it('transcodes any image mime to JPEG via magick', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stdout.push(JPEG_BYTES);
				proc.stdout.push(null);
				proc.emit('close', 0);
			});
			return proc;
		});
		const normalizer = createReceiptNormalizer({
			pdfProcessor: fakePdfProcessor(async () => COMPRESSED_PDF),
			spawn: spawnFn as never
		});

		const result = await normalizer.normalize(Buffer.from([10, 20, 30]), PNG_MIME);

		expect(result.mime).toBe(JPEG_MIME);
		expect(Buffer.from(result.bytes).equals(JPEG_BYTES)).toBe(true);
		expect(spawnFn).toHaveBeenCalledTimes(1);
	});

	it('normalizes a HEIC upload to JPEG (viewable in non-Safari browsers)', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stdout.push(JPEG_BYTES);
				proc.stdout.push(null);
				proc.emit('close', 0);
			});
			return proc;
		});
		const normalizer = createReceiptNormalizer({
			pdfProcessor: fakePdfProcessor(async () => COMPRESSED_PDF),
			spawn: spawnFn as never
		});

		const result = await normalizer.normalize(
			Buffer.from([0, 0, 0, 0x18, ...Buffer.from('ftypheic')]),
			HEIC_MIME
		);

		expect(result.mime).toBe(JPEG_MIME);
		expect(Buffer.from(result.bytes).equals(JPEG_BYTES)).toBe(true);
	});

	it('compresses a PDF via the pdf processor and keeps the PDF mime', async () => {
		const compress = vi.fn(async () => COMPRESSED_PDF);
		const normalizer = createReceiptNormalizer({ pdfProcessor: fakePdfProcessor(compress) });

		const result = await normalizer.normalize(Buffer.from('%PDF-1.4 body'), PDF_MIME);

		expect(result.mime).toBe(PDF_MIME);
		expect(Buffer.from(result.bytes).equals(COMPRESSED_PDF)).toBe(true);
		expect(compress).toHaveBeenCalledTimes(1);
	});

	it('wraps a magick failure as ReceiptNormalizeError', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stderr.push('magick: decode error\n');
				proc.stderr.push(null);
				proc.emit('close', 1);
			});
			return proc;
		});
		const normalizer = createReceiptNormalizer({
			pdfProcessor: fakePdfProcessor(async () => COMPRESSED_PDF),
			spawn: spawnFn as never
		});

		await expect(normalizer.normalize(Buffer.from([1, 2, 3]), PNG_MIME)).rejects.toBeInstanceOf(
			ReceiptNormalizeError
		);
	});

	it('wraps a pdf compress failure as ReceiptNormalizeError', async () => {
		const normalizer = createReceiptNormalizer({
			pdfProcessor: fakePdfProcessor(async () => {
				throw new ReceiptPdfCompressError();
			})
		});

		await expect(normalizer.normalize(Buffer.from('%PDF-1.4'), PDF_MIME)).rejects.toBeInstanceOf(
			ReceiptNormalizeError
		);
	});
});
