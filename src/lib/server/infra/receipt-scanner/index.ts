import { env } from '$env/dynamic/private';
import {
	ReceiptScannerConfigError,
	type IReceiptScanner
} from '$lib/server/app/interfaces/receipt-scanner';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';
import type { IPdfProcessor } from '$lib/server/infra/pdf';
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
	logger?: ILogger;
}

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

export function resolveScannerConfig(env: NodeJS.ProcessEnv, logger: ILogger = NOOP_LOGGER): ScannerConfig {
	const backend = env.RECEIPT_SCANNER_BACKEND;

	if (!backend) {
		return { backend: 'off' };
	}

	if (backend === 'ocr') {
		const ocrApiKey = env.OCR_API_KEY;
		if (!ocrApiKey) {
			logger.error('receipt scanner config missing', { name: 'OCR_API_KEY' });
			throw new ReceiptScannerConfigError();
		}
		const ollamaModel = env.OLLAMA_TEXT_MODEL;
		if (!ollamaModel) {
			logger.error('receipt scanner config missing', { name: 'OLLAMA_TEXT_MODEL' });
			throw new ReceiptScannerConfigError();
		}
		const ollamaBaseUrl = env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
		const ollamaApiKey = env.OLLAMA_API_KEY || undefined;
		return { backend: 'ocr', ocrApiKey, ollamaBaseUrl, ollamaModel, ollamaApiKey };
	}

	logger.error('unknown receipt scanner backend', { backend });
	throw new ReceiptScannerConfigError();
}

export function createReceiptScannerBackend(
	envOverride?: NodeJS.ProcessEnv,
	deps?: CreateScannerDeps
): IReceiptScanner | null {
	const logger = deps?.logger ?? NOOP_LOGGER;
	const config = resolveScannerConfig(envOverride ?? env, logger);

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
			logger
		});
	}

	return null;
}
