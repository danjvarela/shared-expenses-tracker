import { describe, it, expect, vi } from 'vitest';
import {
	resolveScannerConfig,
	createReceiptScannerBackend,
	ReceiptScannerConfigError
} from './index';
import type { IPdfProcessor } from '$lib/server/infra/pdf';

const stubPdfProcessor: IPdfProcessor = {
	async countPages() {
		return 1;
	},
	async rasterizeFirstPage() {
		return { image: Buffer.alloc(0), pageCount: 1 };
	},
	async compress() {
		return Buffer.alloc(0);
	}
};

describe('resolveScannerConfig', () => {
	it('returns off when RECEIPT_SCANNER_BACKEND is unset', () => {
		expect(resolveScannerConfig({})).toEqual({ backend: 'off' });
		expect(resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: '' })).toEqual({ backend: 'off' });
	});

	it('ignores STRUCTURING_BACKEND silently when the scanner is off', () => {
		expect(resolveScannerConfig({ STRUCTURING_BACKEND: 'google' })).toEqual({ backend: 'off' });
		expect(resolveScannerConfig({ STRUCTURING_BACKEND: 'nonsense' })).toEqual({
			backend: 'off'
		});
	});

	it('defaults STRUCTURING_BACKEND to ollama and reads the ollama structurer fields', () => {
		const config = resolveScannerConfig({
			RECEIPT_SCANNER_BACKEND: 'ocr',
			OCR_API_KEY: 'ocr-key',
			OLLAMA_TEXT_MODEL: 'llama3.2'
		});
		expect(config).toEqual({
			backend: 'ocr',
			ocrApiKey: 'ocr-key',
			structurer: {
				kind: 'ollama',
				baseUrl: 'http://localhost:11434',
				model: 'llama3.2',
				apiKey: undefined
			}
		});
	});

	it('ollama structurer reuses OLLAMA_BASE_URL and OLLAMA_API_KEY', () => {
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
			structurer: {
				kind: 'ollama',
				baseUrl: 'http://ollama-host:1234',
				model: 'llama3.2',
				apiKey: 'ollama-secret'
			}
		});
	});

	it('selects the google structurer with GOOGLE_API_KEY + GEMINI_MODEL', () => {
		const config = resolveScannerConfig({
			RECEIPT_SCANNER_BACKEND: 'ocr',
			OCR_API_KEY: 'ocr-key',
			STRUCTURING_BACKEND: 'google',
			GOOGLE_API_KEY: 'google-secret',
			GEMINI_MODEL: 'gemini-2.0-flash'
		});
		expect(config).toEqual({
			backend: 'ocr',
			ocrApiKey: 'ocr-key',
			structurer: { kind: 'google', model: 'gemini-2.0-flash', apiKey: 'google-secret' }
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

	it('throws ReceiptScannerConfigError when the default ollama structurer has no OLLAMA_TEXT_MODEL', () => {
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

	it('throws ReceiptScannerConfigError when the google structurer has no GOOGLE_API_KEY', () => {
		expect(() =>
			resolveScannerConfig({
				RECEIPT_SCANNER_BACKEND: 'ocr',
				OCR_API_KEY: 'ocr-key',
				STRUCTURING_BACKEND: 'google',
				GEMINI_MODEL: 'gemini-2.0-flash'
			})
		).toThrow(ReceiptScannerConfigError);
		expect(() =>
			resolveScannerConfig({
				RECEIPT_SCANNER_BACKEND: 'ocr',
				OCR_API_KEY: 'ocr-key',
				STRUCTURING_BACKEND: 'google',
				GOOGLE_API_KEY: '',
				GEMINI_MODEL: 'gemini-2.0-flash'
			})
		).toThrow(ReceiptScannerConfigError);
	});

	it('throws ReceiptScannerConfigError when the google structurer has no GEMINI_MODEL (no default)', () => {
		expect(() =>
			resolveScannerConfig({
				RECEIPT_SCANNER_BACKEND: 'ocr',
				OCR_API_KEY: 'ocr-key',
				STRUCTURING_BACKEND: 'google',
				GOOGLE_API_KEY: 'google-secret'
			})
		).toThrow(ReceiptScannerConfigError);
		expect(() =>
			resolveScannerConfig({
				RECEIPT_SCANNER_BACKEND: 'ocr',
				OCR_API_KEY: 'ocr-key',
				STRUCTURING_BACKEND: 'google',
				GOOGLE_API_KEY: 'google-secret',
				GEMINI_MODEL: ''
			})
		).toThrow(ReceiptScannerConfigError);
	});

	it('throws ReceiptScannerConfigError for an unknown scanner backend', () => {
		expect(() => resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: 'azure-ocr' })).toThrow(
			ReceiptScannerConfigError
		);
		expect(() => resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: 'ollama' })).toThrow(
			ReceiptScannerConfigError
		);
	});

	it('throws ReceiptScannerConfigError for an unknown structuring backend', () => {
		expect(() =>
			resolveScannerConfig({
				RECEIPT_SCANNER_BACKEND: 'ocr',
				OCR_API_KEY: 'ocr-key',
				STRUCTURING_BACKEND: 'azure'
			})
		).toThrow(ReceiptScannerConfigError);
	});
});

describe('createReceiptScannerBackend', () => {
	it('returns null when the feature is off', () => {
		expect(createReceiptScannerBackend({}, { pdfProcessor: stubPdfProcessor })).toBeNull();
	});

	it('throws at boot for an unknown scanner backend', () => {
		expect(() =>
			createReceiptScannerBackend(
				{ RECEIPT_SCANNER_BACKEND: 'azure-ocr' },
				{ pdfProcessor: stubPdfProcessor }
			)
		).toThrow(ReceiptScannerConfigError);
	});

	it('throws at boot for an unknown structuring backend', () => {
		expect(() =>
			createReceiptScannerBackend(
				{
					RECEIPT_SCANNER_BACKEND: 'ocr',
					OCR_API_KEY: 'ocr-key',
					STRUCTURING_BACKEND: 'azure'
				},
				{ pdfProcessor: stubPdfProcessor }
			)
		).toThrow(ReceiptScannerConfigError);
	});

	it('throws when a backend is active but no pdfProcessor is provided', () => {
		expect(() =>
			createReceiptScannerBackend({
				RECEIPT_SCANNER_BACKEND: 'ocr',
				OCR_API_KEY: 'ocr-key',
				OLLAMA_TEXT_MODEL: 'llama3.2'
			})
		).toThrow();
	});

	it('returns an IReceiptScanner when configured for ocr with the default ollama structurer', () => {
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

	it('returns an IReceiptScanner when configured for ocr with the google structurer', () => {
		const scanner = createReceiptScannerBackend(
			{
				RECEIPT_SCANNER_BACKEND: 'ocr',
				OCR_API_KEY: 'ocr-key',
				STRUCTURING_BACKEND: 'google',
				GOOGLE_API_KEY: 'google-secret',
				GEMINI_MODEL: 'gemini-2.0-flash'
			},
			{ pdfProcessor: stubPdfProcessor }
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

	it('throws at boot when the google structurer is missing GOOGLE_API_KEY', () => {
		expect(() =>
			createReceiptScannerBackend(
				{
					RECEIPT_SCANNER_BACKEND: 'ocr',
					OCR_API_KEY: 'ocr-key',
					STRUCTURING_BACKEND: 'google',
					GEMINI_MODEL: 'gemini-2.0-flash'
				},
				{ pdfProcessor: stubPdfProcessor }
			)
		).toThrow(ReceiptScannerConfigError);
	});

	it('throws at boot when the google structurer is missing GEMINI_MODEL', () => {
		expect(() =>
			createReceiptScannerBackend(
				{
					RECEIPT_SCANNER_BACKEND: 'ocr',
					OCR_API_KEY: 'ocr-key',
					STRUCTURING_BACKEND: 'google',
					GOOGLE_API_KEY: 'google-secret'
				},
				{ pdfProcessor: stubPdfProcessor }
			)
		).toThrow(ReceiptScannerConfigError);
	});
});
