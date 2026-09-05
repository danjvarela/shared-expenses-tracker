import { env } from '$env/dynamic/private';
import { GoogleGenAI } from '@google/genai';
import {
	ReceiptScannerConfigError,
	type IReceiptScanner
} from '$lib/server/app/interfaces/receipt-scanner';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';
import type { IPdfProcessor } from '$lib/server/infra/pdf';
import { createOcrReceiptScanner } from './ocr';
import { createOllamaReceiptStructurer } from './structurers/ollama';
import { createGoogleReceiptStructurer } from './structurers/google';
import type { IReceiptStructurer } from './structurer';

export type {
	IReceiptScanner,
	ScanResult,
	ReceiptScanLineItem
} from '$lib/server/app/interfaces/receipt-scanner';
export {
	ReceiptScannerError,
	ReceiptScannerConfigError
} from '$lib/server/app/interfaces/receipt-scanner';

export type StructurerConfig =
	| { kind: 'ollama'; baseUrl: string; model: string; apiKey?: string }
	| { kind: 'google'; model: string; apiKey: string };

export type ScannerConfig =
	| { backend: 'off' }
	| {
			backend: 'ocr';
			ocrApiKey: string;
			structurer: StructurerConfig;
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
		return { backend: 'ocr', ocrApiKey, structurer: resolveStructurerConfig(env, logger) };
	}

	logger.error('unknown receipt scanner backend', { backend });
	throw new ReceiptScannerConfigError();
}

function resolveStructurerConfig(env: NodeJS.ProcessEnv, logger: ILogger): StructurerConfig {
	const structuringBackend = env.STRUCTURING_BACKEND ?? 'ollama';

	if (structuringBackend === 'ollama') {
		const model = env.OLLAMA_TEXT_MODEL;
		if (!model) {
			logger.error('receipt scanner config missing', { name: 'OLLAMA_TEXT_MODEL' });
			throw new ReceiptScannerConfigError();
		}
		const baseUrl = env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
		const apiKey = env.OLLAMA_API_KEY || undefined;
		return { kind: 'ollama', baseUrl, model, apiKey };
	}

	if (structuringBackend === 'google') {
		const apiKey = env.GOOGLE_API_KEY;
		if (!apiKey) {
			logger.error('receipt scanner config missing', { name: 'GOOGLE_API_KEY' });
			throw new ReceiptScannerConfigError();
		}
		const model = env.GEMINI_MODEL;
		if (!model) {
			logger.error('receipt scanner config missing', { name: 'GEMINI_MODEL' });
			throw new ReceiptScannerConfigError();
		}
		return { kind: 'google', model, apiKey };
	}

	logger.error('unknown structuring backend', { structuringBackend });
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
			structurer: createStructurer(config.structurer, deps, logger),
			pdfProcessor: deps.pdfProcessor,
			fetch: deps.fetch,
			logger
		});
	}

	return null;
}

function createStructurer(
	config: StructurerConfig,
	deps: CreateScannerDeps,
	logger: ILogger
): IReceiptStructurer {
	if (config.kind === 'ollama') {
		return createOllamaReceiptStructurer({
			baseUrl: config.baseUrl,
			model: config.model,
			apiKey: config.apiKey,
			fetch: deps.fetch,
			logger
		});
	}

	return createGoogleReceiptStructurer({
		client: new GoogleGenAI({ apiKey: config.apiKey }),
		model: config.model,
		logger
	});
}
