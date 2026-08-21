import { env } from '$env/dynamic/private';
import {
	ReceiptScannerConfigError,
	type IReceiptScanner
} from '$lib/server/app/interfaces/receipt-scanner';
import { createOllamaReceiptScanner } from './ollama';

export type { IReceiptScanner, ScanResult, ReceiptScanLineItem } from '$lib/server/app/interfaces/receipt-scanner';
export { ReceiptScannerError, ReceiptScannerConfigError } from '$lib/server/app/interfaces/receipt-scanner';

export type ScannerConfig =
	| { backend: 'off' }
	| { backend: 'ollama'; baseUrl: string; model: string; apiKey?: string };

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

export function resolveScannerConfig(env: NodeJS.ProcessEnv): ScannerConfig {
	const backend = env.RECEIPT_SCANNER_BACKEND;

	if (!backend) {
		return { backend: 'off' };
	}

	if (backend === 'ollama') {
		const baseUrl = env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
		const model = env.OLLAMA_VISION_MODEL;
		if (!model) {
			console.error('Receipt scanner config missing', 'OLLAMA_VISION_MODEL is not set');
			throw new ReceiptScannerConfigError();
		}
		const apiKey = env.OLLAMA_API_KEY || undefined;
		return { backend: 'ollama', baseUrl, model, apiKey };
	}

	console.error('Unknown receipt scanner backend', backend);
	throw new ReceiptScannerConfigError();
}

export function createReceiptScannerBackend(
	envOverride?: NodeJS.ProcessEnv
): IReceiptScanner | null {
	const config = resolveScannerConfig(envOverride ?? env);

	if (config.backend === 'off') {
		return null;
	}

	if (config.backend === 'ollama') {
		return createOllamaReceiptScanner({
			baseUrl: config.baseUrl,
			model: config.model,
			apiKey: config.apiKey
		});
	}

	return null;
}