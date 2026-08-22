import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import {
	ReceiptScannerError,
	type IReceiptScanner,
	type ScanResult
} from '$lib/server/app/interfaces/receipt-scanner';
import { prepareImage, type SpawnFn } from '$lib/server/infra/image-prep';
import { RESPONSE_FORMAT, STRUCTURING_RULES, extractJson, normalize } from './structuring';

const PROMPT = `You are a financial document parser. The image may be a receipt, an invoice, or a bank/credit-card statement screenshot. Extract structured data from it.
Return JSON with these fields:
- merchant: store, vendor, or financial institution name, or empty string if unknown
- date: the document or statement date exactly as printed, or empty string
- total: grand total exactly as printed on a receipt/invoice, as a raw decimal string (e.g. "42.99"), or empty string for a statement that has no single total
- lineItems: array of line entries, each with:
  - description: the entry description as printed (a purchased item on a receipt, or a posted transaction on a statement)
  - amount: the line amount exactly as printed, as a raw decimal string (e.g. "3.49")

${STRUCTURING_RULES}`;

// num_ctx is bumped so the vision tokens don't truncate the prompt into garbage output.
const NUM_CTX = 8192;

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
