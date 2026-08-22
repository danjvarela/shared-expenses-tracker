import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { createOcrReceiptScanner, type CreateOcrScannerOptions } from './ocr';
import { RESPONSE_FORMAT } from './structuring';
import {
	ReceiptScannerError
} from '$lib/server/app/interfaces/receipt-scanner';
import { ReceiptRasterizeError, type IPdfProcessor } from '$lib/server/infra/pdf';

const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';
const OLLAMA_ENDPOINT = 'http://ollama:11434/api/chat';
const PARSED_TEXT = 'FRESH MART\n2026-08-21\nMilk 3.49\nBread 2.10\nTotal 5.59';

const STRUCTURED = {
	merchant: 'Fresh Mart',
	date: '2026-08-21',
	total: '5.59',
	lineItems: [
		{ description: 'Milk', amount: '3.49' },
		{ description: 'Bread', amount: '2.10' }
	]
};

const EXPECTED_RESULT = {
	merchant: 'Fresh Mart',
	date: '2026-08-21',
	totalDecimal: '5.59',
	lineItems: [
		{ description: 'Milk', amountDecimal: '3.49' },
		{ description: 'Bread', amountDecimal: '2.10' }
	]
};

interface OcrSpaceShape {
	IsErroredOnProcessing: boolean;
	OCRExitCode: number;
	ErrorMessage?: string[];
	ErrorDetails?: string[];
	ParsedResults: { FileParseExitCode: number; ParsedText: string }[];
}

function ocrSpaceResponse(
	parsedText: string,
	overrides: Partial<OcrSpaceShape> = {}
): Response {
	const body: OcrSpaceShape = {
		IsErroredOnProcessing: false,
		OCRExitCode: 1,
		ParsedResults: [{ FileParseExitCode: 1, ParsedText: parsedText }],
		...overrides
	};
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

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

function fakePdfProcessor(pageCount: number): IPdfProcessor & { countPagesCalls: number } {
	const self: IPdfProcessor & { countPagesCalls: number } = {
		countPagesCalls: 0,
		async countPages() {
			self.countPagesCalls++;
			return pageCount;
		},
		async rasterizeFirstPage() {
			return { image: Buffer.alloc(0), pageCount };
		}
	};
	return self;
}

function formEntries(init: unknown): Map<string, string> {
	const form = (init as RequestInit).body as FormData;
	const map = new Map<string, string>();
	for (const [key, value] of form.entries()) {
		map.set(key, String(value));
	}
	return map;
}

function stripPrefix(dataUri: string): { prefix: string; base64: string } {
	const comma = dataUri.indexOf(',');
	return { prefix: dataUri.slice(0, comma + 1), base64: dataUri.slice(comma + 1) };
}

describe('createOcrReceiptScanner', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
	});

	function makeScanner(overrides: Partial<CreateOcrScannerOptions> = {}) {
		return createOcrReceiptScanner({
			ocrApiKey: 'ocr-key',
			ollamaBaseUrl: 'http://ollama:11434',
			ollamaModel: 'llama3.2',
			pdfProcessor: fakePdfProcessor(1),
			fetch: fetchMock as unknown as typeof fetch,
			spawn: magickSpawn() as never,
			...overrides
		});
	}

	// Routes a mocked fetch to the canned OCR.space + Ollama responses.
	function routeBoth(
		ocr: Response = ocrSpaceResponse(PARSED_TEXT),
		ollama: Response = ollamaResponse(JSON.stringify(STRUCTURED))
	) {
		fetchMock.mockImplementation(async (url: string | URL) => {
			const target = String(url);
			if (target === OCR_ENDPOINT) return ocr;
			if (target === OLLAMA_ENDPOINT) return ollama;
			return new Response('', { status: 404 });
		});
	}

	it('runs OCR.space text extraction then Ollama structuring and returns the composed ScanResult', async () => {
		routeBoth();

		const scanner = makeScanner();

		const result = await scanner.scan(makeStream(new Uint8Array([1, 2, 3, 4])), 'image/png');

		expect(result).toEqual(EXPECTED_RESULT);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][0]).toBe(OCR_ENDPOINT);
		expect(fetchMock.mock.calls[1][0]).toBe(OLLAMA_ENDPOINT);
	});

	it('posts the image to OCR.space as a base64 data-URI FormData with the apikey header', async () => {
		routeBoth();

		const scanner = makeScanner();

		await scanner.scan(makeStream(new Uint8Array([1, 2, 3, 4])), 'image/png');

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(OCR_ENDPOINT);
		expect(init.method).toBe('POST');
		expect(new Headers(init.headers).get('apikey')).toBe('ocr-key');
	});

	it('sends all constant OCR.space params in the FormData', async () => {
		routeBoth();

		const scanner = makeScanner();

		await scanner.scan(makeStream(new Uint8Array([1, 2, 3, 4])), 'image/png');

		const entries = formEntries(fetchMock.mock.calls[0][1] as RequestInit);
		expect(entries.get('language')).toBe('eng');
		expect(entries.get('OCREngine')).toBe('2');
		expect(entries.get('isTable')).toBe('true');
		expect(entries.get('isOverlayRequired')).toBe('false');
		expect(entries.get('scale')).toBe('true');
		expect(entries.get('detectOrientation')).toBe('true');
		expect(entries.has('filetype')).toBe(false);
	});

	it('prefixes base64Image per mime for PNG, JPEG, and PDF', async () => {
		fetchMock.mockImplementation(async (url: string | URL) => {
			const target = String(url);
			if (target === OCR_ENDPOINT) return ocrSpaceResponse(PARSED_TEXT);
			if (target === OLLAMA_ENDPOINT) return ollamaResponse(JSON.stringify(STRUCTURED));
			return new Response('', { status: 404 });
		});

		const scanner = makeScanner();

		await scanner.scan(makeStream(new Uint8Array([1])), 'image/png');
		let entries = formEntries(fetchMock.mock.calls[0][1] as RequestInit);
		expect(stripPrefix(entries.get('base64Image')!).prefix).toBe('data:image/png;base64,');

		await scanner.scan(makeStream(new Uint8Array([1])), 'image/jpeg');
		entries = formEntries(fetchMock.mock.calls[2][1] as RequestInit);
		expect(stripPrefix(entries.get('base64Image')!).prefix).toBe('data:image/jpeg;base64,');

		await scanner.scan(makeStream(new Uint8Array(Buffer.from('%PDF-1.4'))), 'application/pdf');
		entries = formEntries(fetchMock.mock.calls[4][1] as RequestInit);
		expect(stripPrefix(entries.get('base64Image')!).prefix).toBe('data:application/pdf;base64,');
	});

	it('prepares images through ImageMagick and sends the prepared bytes, not the raw input', async () => {
		const spawnFn = magickSpawn();
		routeBoth();

		const scanner = makeScanner({ spawn: spawnFn as never });

		const rawInput = new Uint8Array([10, 20, 30, 40, 50]);
		await scanner.scan(makeStream(rawInput), 'image/png');

		expect(spawnFn).toHaveBeenCalledTimes(1);
		const entries = formEntries(fetchMock.mock.calls[0][1] as RequestInit);
		const { base64 } = stripPrefix(entries.get('base64Image')!);
		expect(base64).toBe(FAKE_JPEG.toString('base64'));
		expect(base64).not.toBe(Buffer.from(rawInput).toString('base64'));
	});

	it('sends a PDF raw without preparing it through ImageMagick', async () => {
		const spawnFn = magickSpawn();
		routeBoth();

		const scanner = makeScanner({ spawn: spawnFn as never });

		const rawPdf = Buffer.from('%PDF-1.4 raw');
		await scanner.scan(makeStream(new Uint8Array(rawPdf)), 'application/pdf');

		expect(spawnFn).not.toHaveBeenCalled();
		const entries = formEntries(fetchMock.mock.calls[0][1] as RequestInit);
		const { base64 } = stripPrefix(entries.get('base64Image')!);
		expect(base64).toBe(rawPdf.toString('base64'));
	});

	it('rejects a multi-page PDF with ReceiptRasterizeError before calling OCR.space', async () => {
		routeBoth();
		const pdfProcessor = fakePdfProcessor(2);
		const scanner = makeScanner({ pdfProcessor });

		await expect(
			scanner.scan(makeStream(new Uint8Array(Buffer.from('%PDF-1.4'))), 'application/pdf')
		).rejects.toBeInstanceOf(ReceiptRasterizeError);

		expect(pdfProcessor.countPagesCalls).toBe(1);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('posts the structuring prompt + ParsedText to Ollama with the text model and schema format (no num_ctx, no images)', async () => {
		routeBoth();

		const scanner = makeScanner({ ollamaModel: 'llama3.2' });

		await scanner.scan(makeStream(new Uint8Array([1])), 'image/png');

		const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(url).toBe(OLLAMA_ENDPOINT);
		const body = JSON.parse(init.body as string);
		expect(body.model).toBe('llama3.2');
		expect(body.stream).toBe(false);
		expect(body.format).toEqual(RESPONSE_FORMAT);
		expect(body.options).toBeUndefined();
		expect(body.images).toBeUndefined();
		expect(body.messages).toHaveLength(1);
		expect(body.messages[0].role).toBe('user');
		expect(body.messages[0].content).toContain('OCR-extracted text');
		expect(body.messages[0].content).toContain(PARSED_TEXT);
	});

	it('sends a Bearer auth header to Ollama when ollamaApiKey is set', async () => {
		routeBoth();
		const scanner = makeScanner({ ollamaApiKey: 'ollama-secret' });

		await scanner.scan(makeStream(new Uint8Array([1])), 'image/png');

		const headers = new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers);
		expect(headers.get('Authorization')).toBe('Bearer ollama-secret');
	});

	it('throws ReceiptScannerError when the OCR.space request rejects', async () => {
		fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError on a non-ok OCR.space response', async () => {
		fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('throws ReceiptScannerError when OCR.space reports IsErroredOnProcessing', async () => {
		routeBoth(
			ocrSpaceResponse('', {
				IsErroredOnProcessing: true,
				ErrorMessage: ['rate limited']
			}),
			ollamaResponse(JSON.stringify(STRUCTURED))
		);
		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('throws ReceiptScannerError when OCRExitCode is not 1', async () => {
		routeBoth(ocrSpaceResponse('', { OCRExitCode: 2 }));
		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('throws ReceiptScannerError when FileParseExitCode is not 1', async () => {
		routeBoth(
			ocrSpaceResponse('', {
				ParsedResults: [{ FileParseExitCode: 0, ParsedText: '' }]
			})
		);
		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('throws ReceiptScannerError when ParsedText is empty/whitespace', async () => {
		routeBoth(ocrSpaceResponse('   \n  '));
		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('throws ReceiptScannerError when the Ollama structuring request rejects', async () => {
		fetchMock.mockImplementation(async (url: string | URL) => {
			if (String(url) === OCR_ENDPOINT) return ocrSpaceResponse(PARSED_TEXT);
			throw new Error('ECONNREFUSED');
		});
		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError on a non-ok Ollama structuring response', async () => {
		routeBoth(ocrSpaceResponse(PARSED_TEXT), new Response('boom', { status: 500 }));
		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError when Ollama returns no message content', async () => {
		routeBoth(ocrSpaceResponse(PARSED_TEXT), ollamaResponse(undefined));
		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError when Ollama returns malformed JSON', async () => {
		routeBoth(ocrSpaceResponse(PARSED_TEXT), ollamaResponse('not json'));
		const scanner = makeScanner();

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});
});