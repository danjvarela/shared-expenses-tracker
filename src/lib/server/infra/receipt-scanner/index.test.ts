import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	resolveScannerConfig,
	createReceiptScannerBackend,
	ReceiptScannerConfigError
} from './index';
import type { IReceiptScanner, ScanResult } from '$lib/server/app/interfaces/receipt-scanner';
import type { IPdfProcessor } from '$lib/server/infra/pdf';

const stubPdfProcessor: IPdfProcessor = {
	async countPages() {
		return 1;
	},
	async rasterizeFirstPage() {
		return { image: Buffer.alloc(0), pageCount: 1 };
	}
};

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(here, 'fixtures/receipt.png');

describe('resolveScannerConfig', () => {
	it('returns off when RECEIPT_SCANNER_BACKEND is unset', () => {
		expect(resolveScannerConfig({})).toEqual({ backend: 'off' });
		expect(resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: '' })).toEqual({ backend: 'off' });
	});

	it('returns ollama config with the default base url when model is set', () => {
		const config = resolveScannerConfig({
			RECEIPT_SCANNER_BACKEND: 'ollama',
			OLLAMA_VISION_MODEL: 'llama3.2-vision'
		});
		expect(config).toEqual({
			backend: 'ollama',
			baseUrl: 'http://localhost:11434',
			model: 'llama3.2-vision',
			apiKey: undefined
		});
	});

	it('returns ocr config with the api key, base url, and text model', () => {
		const config = resolveScannerConfig({
			RECEIPT_SCANNER_BACKEND: 'ocr',
			OCR_API_KEY: 'ocr-key',
			OLLAMA_TEXT_MODEL: 'llama3.2'
		});
		expect(config).toEqual({
			backend: 'ocr',
			ocrApiKey: 'ocr-key',
			ollamaBaseUrl: 'http://localhost:11434',
			ollamaModel: 'llama3.2',
			ollamaApiKey: undefined
		});
	});

	it('ocr config reuses OLLAMA_BASE_URL and OLLAMA_API_KEY', () => {
		const config = resolveScannerConfig({
			RECEIPT_SCANNER_BACKEND: 'ocr',
			OCR_API_KEY: 'ocr-key',
			OLLAMA_TEXT_MODEL: 'llama3.2',
			OLLAMA_BASE_URL: 'http://ollama-host:1234',
			OLLAMA_API_KEY: 'ollama-secret'
		});
		expect(config).toEqual({
			backend: 'ocr',
			ocrApiKey: 'ocr-key',
			ollamaBaseUrl: 'http://ollama-host:1234',
			ollamaModel: 'llama3.2',
			ollamaApiKey: 'ollama-secret'
		});
	});

	it('throws ReceiptScannerConfigError when ocr backend has no OCR_API_KEY', () => {
		expect(() =>
			resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: 'ocr', OLLAMA_TEXT_MODEL: 'llama3.2' })
		).toThrow(ReceiptScannerConfigError);
		expect(() =>
			resolveScannerConfig({
				RECEIPT_SCANNER_BACKEND: 'ocr',
				OCR_API_KEY: '',
				OLLAMA_TEXT_MODEL: 'llama3.2'
			})
		).toThrow(ReceiptScannerConfigError);
	});

	it('throws ReceiptScannerConfigError when ocr backend has no OLLAMA_TEXT_MODEL', () => {
		expect(() =>
			resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: 'ocr', OCR_API_KEY: 'ocr-key' })
		).toThrow(ReceiptScannerConfigError);
		expect(() =>
			resolveScannerConfig({
				RECEIPT_SCANNER_BACKEND: 'ocr',
				OCR_API_KEY: 'ocr-key',
				OLLAMA_TEXT_MODEL: ''
			})
		).toThrow(ReceiptScannerConfigError);
	});

	it('uses OLLAMA_BASE_URL when provided', () => {
		const config = resolveScannerConfig({
			RECEIPT_SCANNER_BACKEND: 'ollama',
			OLLAMA_BASE_URL: 'http://ollama-host:1234',
			OLLAMA_VISION_MODEL: 'llama3.2-vision'
		});
		expect(config).toEqual({
			backend: 'ollama',
			baseUrl: 'http://ollama-host:1234',
			model: 'llama3.2-vision',
			apiKey: undefined
		});
	});

	it('reads OLLAMA_API_KEY for cloud auth when provided', () => {
		const config = resolveScannerConfig({
			RECEIPT_SCANNER_BACKEND: 'ollama',
			OLLAMA_BASE_URL: 'https://ollama.com',
			OLLAMA_VISION_MODEL: 'gpt-oss:120b',
			OLLAMA_API_KEY: 'secret-key'
		});
		expect(config).toEqual({
			backend: 'ollama',
			baseUrl: 'https://ollama.com',
			model: 'gpt-oss:120b',
			apiKey: 'secret-key'
		});
	});

	it('throws ReceiptScannerConfigError when ollama backend has no model', () => {
		expect(() => resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: 'ollama' })).toThrow(
			ReceiptScannerConfigError
		);
		expect(() =>
			resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: 'ollama', OLLAMA_VISION_MODEL: '' })
		).toThrow(ReceiptScannerConfigError);
	});

	it('throws ReceiptScannerConfigError for an unknown backend', () => {
		expect(() => resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: 'azure-ocr' })).toThrow(
			ReceiptScannerConfigError
		);
	});
});

describe('createReceiptScannerBackend', () => {
	it('returns null when the feature is off', () => {
		expect(createReceiptScannerBackend({}, { pdfProcessor: stubPdfProcessor })).toBeNull();
	});

	it('returns an IReceiptScanner when configured for ollama', () => {
		const scanner = createReceiptScannerBackend(
			{
				RECEIPT_SCANNER_BACKEND: 'ollama',
				OLLAMA_VISION_MODEL: 'llama3.2-vision'
			},
			{ pdfProcessor: stubPdfProcessor }
		);
		expect(scanner).not.toBeNull();
		expect(typeof scanner?.scan).toBe('function');
	});

	it('returns a scanner whose scan resolves to a ScanResult-shaped object', async () => {
		const fetchStub = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					message: {
						content: JSON.stringify({ lineItems: [{ description: 'Milk', amount: '1.00' }] })
					}
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchStub);

		const scanner = createReceiptScannerBackend(
			{
				RECEIPT_SCANNER_BACKEND: 'ollama',
				OLLAMA_VISION_MODEL: 'llama3.2-vision'
			},
			{ pdfProcessor: stubPdfProcessor }
		) as IReceiptScanner;

		const bytes = await readFile(FIXTURE_PATH);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(bytes));
				controller.close();
			}
		});

		const result = await scanner.scan(stream, 'image/png');
		const expected: ScanResult = {
			lineItems: [{ description: 'Milk', amountDecimal: '1.00' }]
		};
		expect(result).toEqual(expected);
		vi.unstubAllGlobals();
	});

	it('throws at boot when the model is missing', () => {
		expect(() =>
			createReceiptScannerBackend(
				{ RECEIPT_SCANNER_BACKEND: 'ollama' },
				{ pdfProcessor: stubPdfProcessor }
			)
		).toThrow(ReceiptScannerConfigError);
	});

	it('throws at boot for an unknown backend', () => {
		expect(() =>
			createReceiptScannerBackend(
				{ RECEIPT_SCANNER_BACKEND: 'azure-ocr' },
				{ pdfProcessor: stubPdfProcessor }
			)
		).toThrow(ReceiptScannerConfigError);
	});

	it('throws when a backend is active but no pdfProcessor is provided', () => {
		expect(() =>
			createReceiptScannerBackend({
				RECEIPT_SCANNER_BACKEND: 'ollama',
				OLLAMA_VISION_MODEL: 'llama3.2-vision'
			})
		).toThrow();
	});

	it('returns an IReceiptScanner when configured for ocr', () => {
		const fetchStub = vi.fn();
		const scanner = createReceiptScannerBackend(
			{
				RECEIPT_SCANNER_BACKEND: 'ocr',
				OCR_API_KEY: 'ocr-key',
				OLLAMA_TEXT_MODEL: 'llama3.2'
			},
			{ pdfProcessor: stubPdfProcessor, fetch: fetchStub as unknown as typeof fetch }
		);
		expect(scanner).not.toBeNull();
		expect(typeof scanner?.scan).toBe('function');
	});

	it('throws at boot when ocr is missing OCR_API_KEY', () => {
		expect(() =>
			createReceiptScannerBackend(
				{ RECEIPT_SCANNER_BACKEND: 'ocr', OLLAMA_TEXT_MODEL: 'llama3.2' },
				{ pdfProcessor: stubPdfProcessor }
			)
		).toThrow(ReceiptScannerConfigError);
	});

	it('throws at boot when ocr is missing OLLAMA_TEXT_MODEL', () => {
		expect(() =>
			createReceiptScannerBackend(
				{ RECEIPT_SCANNER_BACKEND: 'ocr', OCR_API_KEY: 'ocr-key' },
				{ pdfProcessor: stubPdfProcessor }
			)
		).toThrow(ReceiptScannerConfigError);
	});
});
