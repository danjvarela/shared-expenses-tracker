import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import {
	ReceiptScannerError,
	type IReceiptScanner,
	type ScanResult
} from '$lib/server/app/interfaces/receipt-scanner';
import { prepareImage, type SpawnFn } from '$lib/server/infra/image-prep';
import { ReceiptRasterizeError, type IPdfProcessor } from '$lib/server/infra/pdf';
import { RESPONSE_FORMAT, STRUCTURING_RULES, extractJson, normalize } from './structuring';

const PDF_MIME = 'application/pdf';
const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';
const MULTI_PAGE_MESSAGE = 'This PDF has multiple pages. Only single-page receipts are supported.';
const UNREADABLE_MESSAGE = 'Scanner could not read this receipt';

// OCR-text framing of the shared structuring rules.
const TEXT_PROMPT = `You are a financial document parser. The input is OCR-extracted text from a receipt, an invoice, or a bank/credit-card statement. Extract structured data from it.
Return JSON with these fields:
- merchant: store, vendor, or financial institution name, or empty string if unknown
- date: the document or statement date exactly as printed, or empty string
- total: grand total exactly as printed on a receipt/invoice, as a raw decimal string (e.g. "42.99"), or empty string for a statement that has no single total
- lineItems: array of line entries, each with:
  - description: the entry description as printed (a purchased item on a receipt, or a posted transaction on a statement)
  - amount: the line amount exactly as printed, as a raw decimal string (e.g. "3.49")

${STRUCTURING_RULES}`;

interface OcrSpaceResponse {
	IsErroredOnProcessing?: boolean;
	OCRExitCode?: number;
	ErrorMessage?: unknown;
	ErrorDetails?: unknown;
	ParsedResults?: { FileParseExitCode?: number; ParsedText?: string }[];
}

interface OllamaChatResponse {
	message?: { content?: string };
}

function dataUri(mime: string, base64: string): string {
	if (mime === 'image/png') return `data:image/png;base64,${base64}`;
	if (mime === PDF_MIME) return `data:application/pdf;base64,${base64}`;
	return `data:image/jpeg;base64,${base64}`;
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
	const nodeStream = Readable.fromWeb(stream as unknown as Parameters<typeof Readable.fromWeb>[0]);
	const chunks: Buffer[] = [];
	for await (const chunk of nodeStream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

function bufferToStream(buf: Buffer): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array(buf));
			controller.close();
		}
	});
}

export interface CreateOcrScannerOptions {
	ocrApiKey: string;
	ollamaBaseUrl: string;
	ollamaModel: string;
	ollamaApiKey?: string;
	pdfProcessor: IPdfProcessor;
	fetch?: typeof fetch;
	spawn?: SpawnFn;
}

export function createOcrReceiptScanner({
	ocrApiKey,
	ollamaBaseUrl,
	ollamaModel,
	ollamaApiKey,
	pdfProcessor,
	fetch = globalThis.fetch,
	spawn: spawnFn = spawn
}: CreateOcrScannerOptions): IReceiptScanner {
	const ollamaEndpoint = `${ollamaBaseUrl.replace(/\/$/, '')}/api/chat`;
	const ollamaHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
	if (ollamaApiKey) {
		ollamaHeaders.Authorization = `Bearer ${ollamaApiKey}`;
	}

	return {
		async scan(stream, mime): Promise<ScanResult> {
			const input = await streamToBuffer(stream);

			let payload: Buffer;
			if (mime === PDF_MIME) {
				const pageCount = await pdfProcessor.countPages(bufferToStream(input));
				if (pageCount > 1) {
					throw new ReceiptRasterizeError(MULTI_PAGE_MESSAGE);
				}
				payload = input;
			} else {
				payload = await prepareImage(input, spawnFn);
			}

			const base64Image = dataUri(mime, payload.toString('base64'));

			const form = new FormData();
			form.append('base64Image', base64Image);
			form.append('language', 'eng');
			form.append('OCREngine', '2');
			form.append('isTable', 'true');
			form.append('isOverlayRequired', 'false');
			form.append('scale', 'true');
			form.append('detectOrientation', 'true');

			let ocrResponse: Response;
			try {
				ocrResponse = await fetch(OCR_ENDPOINT, {
					method: 'POST',
					headers: { apikey: ocrApiKey },
					body: form
				});
			} catch (err) {
				console.error('OCR.space request failed', String(err));
				throw new ReceiptScannerError(`Scanner request failed: ${String(err)}`);
			}

			if (!ocrResponse.ok) {
				console.error('OCR.space request failed', ocrResponse.status);
				throw new ReceiptScannerError(`Scanner request failed: HTTP ${ocrResponse.status}`);
			}

			const ocrBody = (await ocrResponse.json()) as OcrSpaceResponse;
			const firstResult = ocrBody.ParsedResults?.[0];
			if (
				ocrBody.IsErroredOnProcessing ||
				ocrBody.OCRExitCode !== 1 ||
				firstResult?.FileParseExitCode !== 1
			) {
				console.error('OCR.space parse failed', {
					OCRExitCode: ocrBody.OCRExitCode,
					FileParseExitCode: firstResult?.FileParseExitCode,
					ErrorMessage: ocrBody.ErrorMessage,
					ErrorDetails: ocrBody.ErrorDetails
				});
				throw new ReceiptScannerError(UNREADABLE_MESSAGE);
			}

			const parsedText = (firstResult.ParsedText ?? '').trim();
			if (!parsedText) {
				throw new ReceiptScannerError(UNREADABLE_MESSAGE);
			}

			let ollamaResponse: Response;
			try {
				ollamaResponse = await fetch(ollamaEndpoint, {
					method: 'POST',
					headers: ollamaHeaders,
					body: JSON.stringify({
						model: ollamaModel,
						stream: false,
						format: RESPONSE_FORMAT,
						messages: [{ role: 'user', content: `${TEXT_PROMPT}\n\n${parsedText}` }]
					})
				});
			} catch (err) {
				console.error('Ollama structuring request failed', String(err));
				throw new ReceiptScannerError(`Scanner request failed: ${String(err)}`);
			}

			if (!ollamaResponse.ok) {
				console.error('Ollama structuring request failed', ollamaResponse.status);
				throw new ReceiptScannerError(`Scanner request failed: HTTP ${ollamaResponse.status}`);
			}

			const ollamaBody = (await ollamaResponse.json()) as OllamaChatResponse;
			const content = ollamaBody?.message?.content;
			if (typeof content !== 'string') {
				throw new ReceiptScannerError('Scanner returned an unexpected response');
			}

			let structured: unknown;
			try {
				structured = JSON.parse(extractJson(content));
			} catch {
				console.error('Ollama structuring returned non-JSON content', content.slice(0, 500));
				throw new ReceiptScannerError('Scanner returned malformed JSON');
			}

			return normalize(structured);
		}
	};
}