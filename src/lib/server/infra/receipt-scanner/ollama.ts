import { Readable } from 'node:stream';
import {
	ReceiptScannerError,
	type IReceiptScanner,
	type ReceiptScanLineItem,
	type ScanResult
} from '$lib/server/app/interfaces/receipt-scanner';

const PROMPT = `You are a financial document parser. The image may be a receipt, an invoice, or a bank/credit-card statement screenshot. Extract structured data from it.
Return JSON with these fields:
- merchant: store, vendor, or financial institution name, or empty string if unknown
- date: the document or statement date exactly as printed, or empty string
- total: grand total exactly as printed on a receipt/invoice, as a raw decimal string (e.g. "42.99"), or empty string for a statement that has no single total
- lineItems: array of line entries, each with:
  - description: the entry description as printed (a purchased item on a receipt, or a posted transaction on a statement)
  - amount: the line amount exactly as printed, as a raw decimal string (e.g. "3.49")

Rules:
- Amounts are raw decimal strings exactly as printed. Never invent cents, never convert currency, never round, never strip a leading minus sign.
- For a receipt or invoice, include only purchased line items. Exclude subtotals, tax, discounts, totals, and payment lines.
- For a bank or credit-card statement screenshot, treat each posted transaction as a line item. Exclude the header row, column labels, running balances, statement totals, opening/closing balance, and any non-transaction rows.
- If a field is absent on the document, return an empty string for it.`;

const RESPONSE_FORMAT = {
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

interface OllamaChatResponse {
	message?: { content?: string };
}

async function streamToBase64(stream: ReadableStream<Uint8Array>): Promise<string> {
	const nodeStream = Readable.fromWeb(
		stream as unknown as Parameters<typeof Readable.fromWeb>[0]
	);
	const chunks: Buffer[] = [];
	for await (const chunk of nodeStream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString('base64');
}

function extractJson(content: string): string {
	const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1] : content;
	const start = candidate.indexOf('{');
	const end = candidate.lastIndexOf('}');
	if (start !== -1 && end !== -1 && end > start) {
		return candidate.slice(start, end + 1);
	}
	return candidate.trim();
}

function normalize(raw: unknown): ScanResult {
	const obj = (raw ?? {}) as Record<string, unknown>;
	const lineItems: ReceiptScanLineItem[] = Array.isArray(obj.lineItems)
		? obj.lineItems
				.map((item) => {
					const entry = (item ?? {}) as Record<string, unknown>;
					return {
						description: String(entry.description ?? '').trim(),
						amountDecimal: String(entry.amount ?? '').trim()
					};
				})
				.filter((item) => item.description && item.amountDecimal)
		: [];

	const result: ScanResult = { lineItems };
	const merchant = String(obj.merchant ?? '').trim();
	const date = String(obj.date ?? '').trim();
	const total = String(obj.total ?? '').trim();
	if (merchant) result.merchant = merchant;
	if (date) result.date = date;
	if (total) result.totalDecimal = total;
	return result;
}

export interface CreateOllamaScannerOptions {
	baseUrl: string;
	model: string;
	apiKey?: string;
	fetch?: typeof fetch;
}

export function createOllamaReceiptScanner({
	baseUrl,
	model,
	apiKey,
	fetch = globalThis.fetch
}: CreateOllamaScannerOptions): IReceiptScanner {
	const endpoint = `${baseUrl.replace(/\/$/, '')}/api/chat`;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	return {
		async scan(stream, _mime): Promise<ScanResult> {
			const image = await streamToBase64(stream);

			let response: Response;
			try {
				response = await fetch(endpoint, {
					method: 'POST',
					headers,
					body: JSON.stringify({
						model,
						stream: false,
						format: RESPONSE_FORMAT,
						messages: [{ role: 'user', content: PROMPT, images: [image] }]
					})
				});
			} catch (err) {
				console.error('Ollama scan request failed', String(err));
				throw new ReceiptScannerError(`Scanner request failed: ${String(err)}`);
			}

			if (!response.ok) {
				console.error('Ollama scan request failed', response.status);
				throw new ReceiptScannerError(`Scanner request failed: HTTP ${response.status}`);
			}

			const body = (await response.json()) as OllamaChatResponse;
			const content = body?.message?.content;
			if (typeof content !== 'string') {
				throw new ReceiptScannerError('Scanner returned an unexpected response');
			}

			let parsed: unknown;
			try {
				parsed = JSON.parse(extractJson(content));
			} catch {
				console.error('Ollama scan returned non-JSON content', content.slice(0, 500));
				throw new ReceiptScannerError('Scanner returned malformed JSON');
			}

			return normalize(parsed);
		}
	};
}