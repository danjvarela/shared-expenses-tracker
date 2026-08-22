import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { createOllamaReceiptScanner, type CreateOllamaScannerOptions } from './ollama';
import { RESPONSE_FORMAT } from './structuring';
import { ReceiptScannerError } from '$lib/server/app/interfaces/receipt-scanner';
import { ReceiptRasterizeError, type IPdfProcessor } from '$lib/server/infra/pdf';

const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;

function ollamaResponse(content: unknown): Response {
	return new Response(JSON.stringify({ message: { content } }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

function makeStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		}
	});
}

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

// The prepared image magick would emit on stdout. Distinct from any raw input
// the test feeds in, so we can assert the sent bytes are the prepared output.
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const FAKE_JPEG_B64 = FAKE_JPEG.toString('base64');

function magickSpawn() {
	return vi.fn(() => {
		const proc = makeProc();
		queueMicrotask(() => {
			proc.stdout.push(FAKE_JPEG);
			proc.stdout.push(null);
			proc.emit('close', 0);
		});
		return proc;
	});
}

const RASTERIZED = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);

function fakePdfProcessor(
	pageCount: number,
	overrides: Partial<IPdfProcessor> = {}
): IPdfProcessor & {
	rasterizeCalls: number;
} {
	const self: IPdfProcessor & { rasterizeCalls: number } = {
		rasterizeCalls: 0,
		async countPages() {
			return pageCount;
		},
		async rasterizeFirstPage() {
			self.rasterizeCalls++;
			if (overrides.rasterizeFirstPage) {
				return overrides.rasterizeFirstPage(new ReadableStream<Uint8Array>());
			}
			return { image: RASTERIZED, pageCount };
		}
	};
	return self;
}

describe('createOllamaReceiptScanner', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
	});

	function makeScanner(overrides: Partial<CreateOllamaScannerOptions> = {}) {
		return createOllamaReceiptScanner({
			baseUrl: 'http://ollama:11434',
			model: 'llama3.2-vision',
			pdfProcessor: fakePdfProcessor(1),
			fetch: fetchMock as unknown as typeof fetch,
			spawn: magickSpawn() as never,
			...overrides
		});
	}

	it('posts bytes as base64 to /api/chat with the vision model and a JSON schema format', async () => {
		fetchMock.mockResolvedValue(
			ollamaResponse(
				JSON.stringify({
					merchant: 'Fresh Mart',
					date: '2026-08-21',
					total: '12.48',
					lineItems: [
						{ description: 'Milk', amount: '3.49' },
						{ description: 'Bread', amount: '2.10' }
					]
				})
			)
		);

		const scanner = makeScanner();

		await scanner.scan(makeStream(new Uint8Array([1, 2, 3, 4])), 'image/png');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://ollama:11434/api/chat');
		expect(init.method).toBe('POST');

		const body = JSON.parse(init.body as string);
		expect(body.model).toBe('llama3.2-vision');
		expect(body.stream).toBe(false);
		expect(body.format).toEqual(RESPONSE_FORMAT);
		expect(body.messages).toHaveLength(1);
		expect(body.messages[0].role).toBe('user');
		expect(body.messages[0].images).toHaveLength(1);
		expect(body.messages[0].images[0]).toMatch(base64Pattern);
		expect(body.messages[0].content).toContain('financial document parser');
	});

	it('resizes/re-encodes the image through ImageMagick before sending (sent bytes are the prepared JPEG, not the raw input)', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const scanner = makeScanner();

		const rawInput = new Uint8Array([10, 20, 30, 40, 50]);
		await scanner.scan(makeStream(rawInput), 'image/png');

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.messages[0].images[0]).toBe(FAKE_JPEG_B64);
		expect(body.messages[0].images[0]).not.toBe(Buffer.from(rawInput).toString('base64'));
	});

	it('sets num_ctx in the request options to avoid prompt truncation', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const scanner = makeScanner();

		await scanner.scan(makeStream(new Uint8Array([1])), 'image/png');

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.options.num_ctx).toBe(8192);
	});

	it('strips a trailing slash from the base url', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const scanner = makeScanner({ baseUrl: 'http://ollama:11434/' });

		await scanner.scan(makeStream(new Uint8Array([1])), 'image/png');

		const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://ollama:11434/api/chat');
	});

	it('sends a Bearer auth header when an apiKey is configured (cloud)', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const scanner = makeScanner({
			baseUrl: 'https://ollama.com',
			model: 'gpt-oss:120b',
			apiKey: 'secret-key'
		});

		await scanner.scan(makeStream(new Uint8Array([1])), 'image/png');

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const headers = new Headers(init.headers);
		expect(headers.get('Authorization')).toBe('Bearer secret-key');
		expect(headers.get('Content-Type')).toBe('application/json');
	});

	it('omits the auth header when no apiKey is set (local)', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const scanner = makeScanner({ baseUrl: 'http://localhost:11434' });

		await scanner.scan(makeStream(new Uint8Array([1])), 'image/png');

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const headers = new Headers(init.headers);
		expect(headers.get('Authorization')).toBeNull();
	});

	it('throws ReceiptScannerError when the request rejects', async () => {
		fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError on a non-ok HTTP response', async () => {
		fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError when the response is not valid JSON content', async () => {
		fetchMock.mockResolvedValue(ollamaResponse('not json'));

		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError when the response has no message content', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(undefined));

		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('rasterizes a PDF page 1 then sends the prepared image (not the raw PDF bytes)', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const pdfProcessor = fakePdfProcessor(1);
		const scanner = makeScanner({ pdfProcessor });

		await scanner.scan(makeStream(new Uint8Array(Buffer.from('%PDF-1.4 ...'))), 'application/pdf');

		expect(pdfProcessor.rasterizeCalls).toBe(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		// The rasterized page is piped through magick (FAKE_JPEG), not sent raw.
		expect(body.messages[0].images[0]).toBe(FAKE_JPEG_B64);
		expect(body.messages[0].images[0]).not.toBe(RASTERIZED.toString('base64'));
	});

	it('rejects a multi-page PDF with ReceiptRasterizeError and does not call Ollama', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const pdfProcessor = fakePdfProcessor(2);
		const scanner = makeScanner({ pdfProcessor });

		await expect(
			scanner.scan(makeStream(new Uint8Array(Buffer.from('%PDF-1.4'))), 'application/pdf')
		).rejects.toBeInstanceOf(ReceiptRasterizeError);

		expect(pdfProcessor.rasterizeCalls).toBe(1);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects a corrupt PDF (rasterize rejects) with ReceiptRasterizeError and does not call Ollama', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const pdfProcessor = fakePdfProcessor(1, {
			rasterizeFirstPage: async () => {
				throw new ReceiptRasterizeError();
			}
		});
		const scanner = makeScanner({ pdfProcessor });

		await expect(
			scanner.scan(makeStream(new Uint8Array(Buffer.from('%PDF-1.4'))), 'application/pdf')
		).rejects.toBeInstanceOf(ReceiptRasterizeError);

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
