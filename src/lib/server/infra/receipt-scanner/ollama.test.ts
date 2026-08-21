import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { createOllamaReceiptScanner, type CreateOllamaScannerOptions } from './ollama';
import { ReceiptScannerError } from '$lib/server/app/interfaces/receipt-scanner';

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

function magickSpawn(output: Buffer = FAKE_JPEG) {
	return vi.fn(() => {
		const proc = makeProc();
		queueMicrotask(() => {
			proc.stdout.push(output);
			proc.stdout.push(null);
			proc.emit('close', 0);
		});
		return proc;
	});
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
		expect(body.format.type).toBe('object');
		expect(body.format.required).toEqual(['lineItems']);
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

	it('invokes magick with the resize/quality args and a JPEG stdout target', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const spawnFn = magickSpawn();
		const scanner = makeScanner({ spawn: spawnFn as never });

		await scanner.scan(makeStream(new Uint8Array([1, 2, 3, 4])), 'image/png');

		expect(spawnFn).toHaveBeenCalledTimes(1);
		const [, args] = (spawnFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			string[]
		];
		expect(args).toEqual(['-', '-resize', '1568x1568>', '-quality', '80', 'jpg:-']);
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

	it('maps the model payload into ScanResult, renaming total/amount to decimal fields', async () => {
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

		const result = await scanner.scan(makeStream(new Uint8Array([1])), 'image/png');

		expect(result).toEqual({
			merchant: 'Fresh Mart',
			date: '2026-08-21',
			totalDecimal: '12.48',
			lineItems: [
				{ description: 'Milk', amountDecimal: '3.49' },
				{ description: 'Bread', amountDecimal: '2.10' }
			]
		});
	});

	it('drops empty optional fields and line items missing description or amount', async () => {
		fetchMock.mockResolvedValue(
			ollamaResponse(
				JSON.stringify({
					merchant: '',
					total: '   ',
					lineItems: [
						{ description: 'Milk', amount: '3.49' },
						{ description: 'Subtotal', amount: '' },
						{ description: '', amount: '0.99' }
					]
				})
			)
		);

		const scanner = makeScanner();

		const result = await scanner.scan(makeStream(new Uint8Array([1])), 'image/png');

		expect(result).toEqual({
			lineItems: [{ description: 'Milk', amountDecimal: '3.49' }]
		});
		expect('merchant' in result).toBe(false);
		expect('date' in result).toBe(false);
		expect('totalDecimal' in result).toBe(false);
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

	it('throws ReceiptScannerError when ImageMagick exits non-zero', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stderr.push('magick: decode error\n');
				proc.stderr.push(null);
				proc.emit('close', 1);
			});
			return proc;
		});

		const scanner = makeScanner({ spawn: spawnFn as never });

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('throws ReceiptScannerError when ImageMagick emits no image', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stdout.push(null);
				proc.emit('close', 0);
			});
			return proc;
		});

		const scanner = makeScanner({ spawn: spawnFn as never });

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('throws ReceiptScannerError when the ImageMagick spawn itself fails (ENOENT)', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => proc.emit('error', new Error('spawn ENOENT')));
			return proc;
		});

		const scanner = makeScanner({ spawn: spawnFn as never });

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
