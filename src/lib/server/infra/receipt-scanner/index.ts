import { env } from '$env/dynamic/private';
import {
	ReceiptScannerConfigError,
	type IReceiptScanner
} from '$lib/server/app/interfaces/receipt-scanner';
import type { IPdfProcessor } from '$lib/server/infra/pdf';
import type { SpawnFn } from '$lib/server/infra/image-prep';
import { createOcrReceiptScanner } from './ocr';

export type {
	IReceiptScanner,
	ScanResult,
	ReceiptScanLineItem
} from '$lib/server/app/interfaces/receipt-scanner';
export {
	ReceiptScannerError,
	ReceiptScannerConfigError
} from '$lib/server/app/interfaces/receipt-scanner';

export type ScannerConfig =
	| { backend: 'off' }
	| {
			backend: 'ocr';
			ocrApiKey: string;
			ollamaBaseUrl: string;
			ollamaModel: string;
			ollamaApiKey?: string;
	  };

export interface CreateScannerDeps {
	pdfProcessor: IPdfProcessor;
	fetch?: typeof fetch;
	spawn?: SpawnFn;
}

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

export function resolveScannerConfig(env: NodeJS.ProcessEnv): ScannerConfig {
	const backend = env.RECEIPT_SCANNER_BACKEND;

	if (!backend) {
		return { backend: 'off' };
	}

	if (backend === 'ocr') {
		const ocrApiKey = env.OCR_API_KEY;
		if (!ocrApiKey) {
			console.error('Receipt scanner config missing', 'OCR_API_KEY is not set');
			throw new ReceiptScannerConfigError();
		}
		const ollamaModel = env.OLLAMA_TEXT_MODEL;
		if (!ollamaModel) {
			console.error('Receipt scanner config missing', 'OLLAMA_TEXT_MODEL is not set');
			throw new ReceiptScannerConfigError();
		}
		const ollamaBaseUrl = env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
		const ollamaApiKey = env.OLLAMA_API_KEY || undefined;
		return { backend: 'ocr', ocrApiKey, ollamaBaseUrl, ollamaModel, ollamaApiKey };
	}

	console.error('Unknown receipt scanner backend', backend);
	throw new ReceiptScannerConfigError();
}

export function createReceiptScannerBackend(
	envOverride?: NodeJS.ProcessEnv,
	deps?: CreateScannerDeps
): IReceiptScanner | null {
	const config = resolveScannerConfig(envOverride ?? env);

	if (config.backend === 'off') {
		return null;
	}

	if (!deps?.pdfProcessor) {
		throw new Error(
			'createReceiptScannerBackend: pdfProcessor is required when a backend is active'
		);
	}

	if (config.backend === 'ocr') {
		return createOcrReceiptScanner({
			ocrApiKey: config.ocrApiKey,
			ollamaBaseUrl: config.ollamaBaseUrl,
			ollamaModel: config.ollamaModel,
			ollamaApiKey: config.ollamaApiKey,
			pdfProcessor: deps.pdfProcessor,
			fetch: deps.fetch,
			spawn: deps.spawn
		});
	}

	return null;
}
