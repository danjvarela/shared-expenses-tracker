import {
	ReceiptScannerError,
	type ScanResult
} from '$lib/server/app/interfaces/receipt-scanner';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';
import { STRUCTURING_RULES, normalize } from '../structuring';
import type { IReceiptStructurer } from '../structurer';

export const RESPONSE_FORMAT = {
	type: 'object',
	properties: {
		merchant: { type: 'string' },
		date: { type: 'string' },
		total: { type: 'string' },
		lineItems: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					description: { type: 'string' },
					amount: { type: 'string' }
				},
				required: ['description', 'amount']
			}
		}
	},
	required: ['lineItems']
} as const;

const TEXT_PROMPT = `You are a financial document parser. The input is OCR-extracted text from a receipt, an invoice, or a bank/credit-card statement. Extract structured data from it.
Return JSON with these fields:
- merchant: store, vendor, or financial institution name, or empty string if unknown
- date: the document or statement date exactly as printed, or empty string
- total: grand total exactly as printed on a receipt/invoice, as a raw decimal string (e.g. "42.99"), or empty string for a statement that has no single total
- lineItems: array of line entries, each with:
  - description: the entry description as printed (a purchased item on a receipt, or a posted transaction on a statement)
  - amount: the line amount exactly as printed, as a raw decimal string (e.g. "3.49")

${STRUCTURING_RULES}`;

interface OllamaChatResponse {
	message?: { content?: string };
}

export function extractJson(content: string): string {
	const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1] : content;
	const start = candidate.indexOf('{');
	const end = candidate.lastIndexOf('}');
	if (start !== -1 && end !== -1 && end > start) {
		return candidate.slice(start, end + 1);
	}
	return candidate.trim();
}

export interface CreateOllamaStructurerOptions {
	baseUrl: string;
	model: string;
	apiKey?: string;
	fetch?: typeof fetch;
	logger?: ILogger;
}

export function createOllamaReceiptStructurer({
	baseUrl,
	model,
	apiKey,
	fetch = globalThis.fetch,
	logger = NOOP_LOGGER
}: CreateOllamaStructurerOptions): IReceiptStructurer {
	const log = logger.child({ component: 'structurer.ollama' });
	const endpoint = `${baseUrl.replace(/\/$/, '')}/api/chat`;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	return {
		async structure(parsedText): Promise<ScanResult> {
			log.info('ollama structuring request', { model });
			const t0 = Date.now();
			let response: Response;
			try {
				response = await fetch(endpoint, {
					method: 'POST',
					headers,
					body: JSON.stringify({
						model,
						stream: false,
						format: RESPONSE_FORMAT,
						messages: [{ role: 'user', content: `${TEXT_PROMPT}\n\n${parsedText}` }]
					})
				});
			} catch (err) {
				log.error('ollama structuring request failed', { err });
				throw new ReceiptScannerError(`Scanner request failed: ${String(err)}`);
			}

			if (!response.ok) {
				log.error('ollama structuring request failed', { status: response.status });
				throw new ReceiptScannerError(`Scanner request failed: HTTP ${response.status}`);
			}

			const body = (await response.json()) as OllamaChatResponse;
			const content = body?.message?.content;
			if (typeof content !== 'string') {
				throw new ReceiptScannerError('Scanner returned an unexpected response');
			}
			log.info('ollama structuring response', { durationMs: Date.now() - t0 });

			let structured: unknown;
			try {
				structured = JSON.parse(extractJson(content));
			} catch {
				log.error('ollama structuring returned non-JSON content');
				throw new ReceiptScannerError('Scanner returned malformed JSON');
			}

			return normalize(structured);
		}
	};
}
