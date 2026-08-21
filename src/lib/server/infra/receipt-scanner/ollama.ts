import { spawn } from 'node:child_process';
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

// Ollama Cloud rejects request bodies over ~20MB with HTTP 413, and a
// poppler-rasterized PDF at 150 DPI PNG blows past that once base64-encoded.
// Ollama also downsamples images internally per-model, so feeding a huge
// image is pure waste. Resize/re-encode to JPEG before sending. num_ctx is
// bumped so the vision tokens don't truncate the prompt into garbage output.
// See docs/adr/0014-ollama-cloud-image-compression.md.
const MAX_LONG_EDGE = 1568;
const JPEG_QUALITY = 80;
const NUM_CTX = 8192;
const PREPARE_FAILED_MESSAGE = 'Scanner could not read this image';

interface OllamaChatResponse {
	message?: { content?: string };
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(1)} ${units[unit]}`;
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
	const nodeStream = Readable.fromWeb(stream as unknown as Parameters<typeof Readable.fromWeb>[0]);
	const chunks: Buffer[] = [];
	for await (const chunk of nodeStream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

function prepareImage(input: Buffer, spawnFn: SpawnFn): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const proc = spawnFn(
			'magick',
			[
				'-',
				'-resize',
				`${MAX_LONG_EDGE}x${MAX_LONG_EDGE}>`,
				'-quality',
				String(JPEG_QUALITY),
				'jpg:-'
			],
			{ stdio: ['pipe', 'pipe', 'pipe'] }
		);
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		proc.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

		function fail(reason: string): void {
			console.error(
				'Receipt image prepare failed',
				reason,
				Buffer.concat(stderr).toString().trim()
			);
			reject(new ReceiptScannerError(PREPARE_FAILED_MESSAGE));
		}

		proc.on('error', () => fail('magick spawn failed'));
		proc.on('close', (code) => {
			if (code !== 0) {
				fail(`magick exited ${code}`);
				return;
			}
			const image = Buffer.concat(stdout);
			if (image.length === 0) {
				fail('magick produced no output');
				return;
			}
			resolve(image);
		});

		proc.stdin.end(input);
	});
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

export type SpawnFn = typeof spawn;

export interface CreateOllamaScannerOptions {
	baseUrl: string;
	model: string;
	apiKey?: string;
	fetch?: typeof fetch;
	spawn?: SpawnFn;
}

export function createOllamaReceiptScanner({
	baseUrl,
	model,
	apiKey,
	fetch = globalThis.fetch,
	spawn: spawnFn = spawn
}: CreateOllamaScannerOptions): IReceiptScanner {
	const endpoint = `${baseUrl.replace(/\/$/, '')}/api/chat`;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	return {
		async scan(stream): Promise<ScanResult> {
			const input = await streamToBuffer(stream);
			console.log('scanning with ollama', { scanInputSize: formatBytes(input.length) });

			try {
				const image = await prepareImage(input, spawnFn);

				let response: Response;
				try {
					response = await fetch(endpoint, {
						method: 'POST',
						headers,
						body: JSON.stringify({
							model,
							stream: false,
							format: RESPONSE_FORMAT,
							options: { num_ctx: NUM_CTX },
							messages: [{ role: 'user', content: PROMPT, images: [image.toString('base64')] }]
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

				const result = normalize(parsed);
				console.log('scan request finished', { compressedSize: formatBytes(image.length) });
				return result;
			} catch (err) {
				console.error('scan request finished', {
					reason: err instanceof Error ? err.message : String(err)
				});
				throw err;
			}
		}
	};
}
