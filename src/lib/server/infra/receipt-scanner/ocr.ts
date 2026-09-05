import { Readable } from 'node:stream';
import {
	ReceiptScannerError,
	type IReceiptScanner,
	type ScanResult
} from '$lib/server/app/interfaces/receipt-scanner';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';
import { ReceiptRasterizeError, type IPdfProcessor } from '$lib/server/infra/pdf';
import type { IReceiptStructurer } from './structurer';

const PDF_MIME = 'application/pdf';
const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';
const MULTI_PAGE_MESSAGE = 'This PDF has multiple pages. Only single-page receipts are supported.';
const UNREADABLE_MESSAGE = 'Scanner could not read this receipt';

interface OcrSpaceResponse {
	IsErroredOnProcessing?: boolean;
	OCRExitCode?: number;
	ErrorMessage?: unknown;
	ErrorDetails?: unknown;
	ParsedResults?: { FileParseExitCode?: number; ParsedText?: string }[];
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
	structurer: IReceiptStructurer;
	pdfProcessor: IPdfProcessor;
	fetch?: typeof fetch;
	logger?: ILogger;
}

export function createOcrReceiptScanner({
	ocrApiKey,
	structurer,
	pdfProcessor,
	fetch = globalThis.fetch,
	logger = NOOP_LOGGER
}: CreateOcrScannerOptions): IReceiptScanner {
	const log = logger.child({ component: 'scanner.ocr' });

	return {
		async scan(stream, mime): Promise<ScanResult> {
			const input = await streamToBuffer(stream);

			if (mime === PDF_MIME) {
				const pageCount = await pdfProcessor.countPages(bufferToStream(input));
				if (pageCount > 1) {
					throw new ReceiptRasterizeError(MULTI_PAGE_MESSAGE);
				}
			}

			const base64Image = dataUri(mime, input.toString('base64'));

			const form = new FormData();
			form.append('base64Image', base64Image);
			form.append('language', 'eng');
			form.append('OCREngine', '2');
			form.append('isTable', 'true');
			form.append('isOverlayRequired', 'false');
			form.append('scale', 'true');
			form.append('detectOrientation', 'true');

			log.info('ocr.space request', { sizeBytes: input.length });
			const ocrT0 = Date.now();
			let ocrResponse: Response;
			try {
				ocrResponse = await fetch(OCR_ENDPOINT, {
					method: 'POST',
					headers: { apikey: ocrApiKey },
					body: form
				});
			} catch (err) {
				log.error('ocr.space request failed', { err });
				throw new ReceiptScannerError(`Scanner request failed: ${String(err)}`);
			}

			if (!ocrResponse.ok) {
				log.error('ocr.space request failed', { status: ocrResponse.status });
				throw new ReceiptScannerError(`Scanner request failed: HTTP ${ocrResponse.status}`);
			}

			const ocrBody = (await ocrResponse.json()) as OcrSpaceResponse;
			const firstResult = ocrBody.ParsedResults?.[0];
			if (
				ocrBody.IsErroredOnProcessing ||
				ocrBody.OCRExitCode !== 1 ||
				firstResult?.FileParseExitCode !== 1
			) {
				log.error('ocr.space parse failed', {
					OCRExitCode: ocrBody.OCRExitCode,
					FileParseExitCode: firstResult?.FileParseExitCode
				});
				throw new ReceiptScannerError(UNREADABLE_MESSAGE);
			}

			const parsedText = (firstResult.ParsedText ?? '').trim();
			if (!parsedText) {
				throw new ReceiptScannerError(UNREADABLE_MESSAGE);
			}
			log.info('ocr.space response', {
				parsedTextChars: parsedText.length,
				durationMs: Date.now() - ocrT0
			});

			return structurer.structure(parsedText);
		}
	};
}
