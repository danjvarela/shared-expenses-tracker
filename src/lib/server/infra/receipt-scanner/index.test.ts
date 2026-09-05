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
	}
};

describe('resolveScannerConfig', () => {
	it('returns off when RECEIPT_SCANNER_BACKEND is unset', () => {
		expect(resolveScannerConfig({})).toEqual({ backend: 'off' });
		expect(resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: '' })).toEqual({ backend: 'off' });
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

	it('throws ReceiptScannerConfigError for an unknown backend', () => {
		expect(() => resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: 'azure-ocr' })).toThrow(
			ReceiptScannerConfigError
		);
		expect(() => resolveScannerConfig({ RECEIPT_SCANNER_BACKEND: 'ollama' })).toThrow(
			ReceiptScannerConfigError
		);
	});
});

describe('createReceiptScannerBackend', () => {
	it('returns null when the feature is off', () => {
		expect(createReceiptScannerBackend({}, { pdfProcessor: stubPdfProcessor })).toBeNull();
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
				RECEIPT_SCANNER_BACKEND: 'ocr',
				OCR_API_KEY: 'ocr-key',
				OLLAMA_TEXT_MODEL: 'llama3.2'
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
