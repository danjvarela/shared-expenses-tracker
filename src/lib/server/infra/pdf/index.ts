import { AppError } from '$lib/server/app/error';

export interface PdfFirstPage {
	image: Buffer;
	pageCount: number;
}

export interface IPdfProcessor {
	countPages(stream: ReadableStream<Uint8Array>): Promise<number>;
	rasterizeFirstPage(stream: ReadableStream<Uint8Array>): Promise<PdfFirstPage>;
}

export class ReceiptRasterizeError extends AppError {
	constructor(
		message = "Couldn't read this PDF — it may be corrupt or password-protected. Try an image instead."
	) {
		super(message, 422);
	}
}

export { createPopplerPdfProcessor } from './poppler';
