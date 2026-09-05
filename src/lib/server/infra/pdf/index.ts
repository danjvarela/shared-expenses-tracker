import { AppError } from '$lib/server/app/error';

export interface PdfFirstPage {
	image: Buffer;
	pageCount: number;
}

export interface IPdfProcessor {
	countPages(stream: ReadableStream<Uint8Array>): Promise<number>;
	rasterizeFirstPage(stream: ReadableStream<Uint8Array>): Promise<PdfFirstPage>;
	compress(stream: ReadableStream<Uint8Array>): Promise<Buffer>;
}

export class ReceiptRasterizeError extends AppError {
	constructor(
		message = "Couldn't read this PDF — it may be corrupt or password-protected. Try an image instead."
	) {
		super(message, 422);
	}
}

export class ReceiptPdfCompressError extends AppError {
	constructor(message = "Couldn't compress this PDF — it may be corrupt or password-protected.") {
		super(message, 422);
	}
}

export { createPopplerPdfProcessor } from './poppler';
