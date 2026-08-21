import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOllamaReceiptScanner } from './ollama';
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

describe('createOllamaReceiptScanner', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
	});

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

		const scanner = createOllamaReceiptScanner({
			baseUrl: 'http://ollama:11434',
			model: 'llama3.2-vision',
			fetch: fetchMock as unknown as typeof fetch
		});

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

	it('strips a trailing slash from the base url', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const scanner = createOllamaReceiptScanner({
			baseUrl: 'http://ollama:11434/',
			model: 'llama3.2-vision',
			fetch: fetchMock as unknown as typeof fetch
		});

		await scanner.scan(makeStream(new Uint8Array([1])), 'image/png');

		const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://ollama:11434/api/chat');
	});

	it('sends a Bearer auth header when an apiKey is configured (cloud)', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const scanner = createOllamaReceiptScanner({
			baseUrl: 'https://ollama.com',
			model: 'gpt-oss:120b',
			apiKey: 'secret-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await scanner.scan(makeStream(new Uint8Array([1])), 'image/png');

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const headers = new Headers(init.headers);
		expect(headers.get('Authorization')).toBe('Bearer secret-key');
		expect(headers.get('Content-Type')).toBe('application/json');
	});

	it('omits the auth header when no apiKey is set (local)', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify({ lineItems: [] })));

		const scanner = createOllamaReceiptScanner({
			baseUrl: 'http://localhost:11434',
			model: 'llama3.2-vision',
			fetch: fetchMock as unknown as typeof fetch
		});

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

		const scanner = createOllamaReceiptScanner({
			baseUrl: 'http://ollama:11434',
			model: 'llama3.2-vision',
			fetch: fetchMock as unknown as typeof fetch
		});

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

		const scanner = createOllamaReceiptScanner({
			baseUrl: 'http://ollama:11434',
			model: 'llama3.2-vision',
			fetch: fetchMock as unknown as typeof fetch
		});

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

		const scanner = createOllamaReceiptScanner({
			baseUrl: 'http://ollama:11434',
			model: 'llama3.2-vision',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError on a non-ok HTTP response', async () => {
		fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

		const scanner = createOllamaReceiptScanner({
			baseUrl: 'http://ollama:11434',
			model: 'llama3.2-vision',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError when the response is not valid JSON content', async () => {
		fetchMock.mockResolvedValue(ollamaResponse('not json'));

		const scanner = createOllamaReceiptScanner({
			baseUrl: 'http://ollama:11434',
			model: 'llama3.2-vision',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError when the response has no message content', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(undefined));

		const scanner = createOllamaReceiptScanner({
			baseUrl: 'http://ollama:11434',
			model: 'llama3.2-vision',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(scanner.scan(makeStream(new Uint8Array([1])), 'image/png')).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});
});