import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createOllamaReceiptStructurer,
	RESPONSE_FORMAT,
	extractJson,
	type CreateOllamaStructurerOptions
} from './ollama';
import { ReceiptScannerError } from '$lib/server/app/interfaces/receipt-scanner';

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

function ollamaResponse(content: unknown): Response {
	return new Response(JSON.stringify({ message: { content } }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('RESPONSE_FORMAT', () => {
	it('is an object schema requiring only lineItems', () => {
		expect(RESPONSE_FORMAT.type).toBe('object');
		expect(RESPONSE_FORMAT.required).toEqual(['lineItems']);
	});

	it('declares string merchant/date/total fields and an array of description/amount items', () => {
		const { properties } = RESPONSE_FORMAT;
		expect(properties.merchant.type).toBe('string');
		expect(properties.date.type).toBe('string');
		expect(properties.total.type).toBe('string');
		expect(properties.lineItems.type).toBe('array');
		expect(properties.lineItems.items.required).toEqual(['description', 'amount']);
	});
});

describe('extractJson', () => {
	it('extracts the JSON object from a fenced code block', () => {
		const content = 'Here you go:\n```json\n{"merchant": "X"}\n```\nDone.';
		expect(extractJson(content)).toBe('{"merchant": "X"}');
	});

	it('extracts the outermost JSON object from bare text', () => {
		const content = 'noise {"a": 1, "b": {"c": 2}} trailing';
		expect(extractJson(content)).toBe('{"a": 1, "b": {"c": 2}}');
	});

	it('returns trimmed content when no JSON object is present', () => {
		expect(extractJson('  no json here  ')).toBe('no json here');
	});
});

describe('createOllamaReceiptStructurer', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
	});

	function makeStructurer(overrides: Partial<CreateOllamaStructurerOptions> = {}) {
		return createOllamaReceiptStructurer({
			baseUrl: 'http://ollama:11434',
			model: 'llama3.2',
			fetch: fetchMock as unknown as typeof fetch,
			...overrides
		});
	}

	it('posts the structuring prompt + parsedText to Ollama with the text model and schema format (no num_ctx, no images)', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify(STRUCTURED)));
		const structurer = makeStructurer({ model: 'llama3.2' });

		await structurer.structure(PARSED_TEXT);

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
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

	it('normalizes the Ollama JSON into a ScanResult', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify(STRUCTURED)));
		const structurer = makeStructurer();

		const result = await structurer.structure(PARSED_TEXT);

		expect(result).toEqual(EXPECTED_RESULT);
	});

	it('sends a Bearer auth header to Ollama when apiKey is set', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify(STRUCTURED)));
		const structurer = makeStructurer({ apiKey: 'ollama-secret' });

		await structurer.structure(PARSED_TEXT);

		const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
		expect(headers.get('Authorization')).toBe('Bearer ollama-secret');
	});

	it('omits the Authorization header when no apiKey is set', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify(STRUCTURED)));
		const structurer = makeStructurer();

		await structurer.structure(PARSED_TEXT);

		const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
		expect(headers.get('Authorization')).toBeNull();
	});

	it('strips a trailing slash from baseUrl when building the endpoint', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(JSON.stringify(STRUCTURED)));
		const structurer = makeStructurer({ baseUrl: 'http://ollama:11434/' });

		await structurer.structure(PARSED_TEXT);

		expect(fetchMock.mock.calls[0][0]).toBe(OLLAMA_ENDPOINT);
	});

	it('throws ReceiptScannerError when the Ollama structuring request rejects', async () => {
		fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
		const structurer = makeStructurer();

		await expect(structurer.structure(PARSED_TEXT)).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError on a non-ok Ollama structuring response', async () => {
		fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
		const structurer = makeStructurer();

		await expect(structurer.structure(PARSED_TEXT)).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError when Ollama returns no message content', async () => {
		fetchMock.mockResolvedValue(ollamaResponse(undefined));
		const structurer = makeStructurer();

		await expect(structurer.structure(PARSED_TEXT)).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});

	it('throws ReceiptScannerError when Ollama returns malformed JSON', async () => {
		fetchMock.mockResolvedValue(ollamaResponse('not json'));
		const structurer = makeStructurer();

		await expect(structurer.structure(PARSED_TEXT)).rejects.toBeInstanceOf(
			ReceiptScannerError
		);
	});
});
