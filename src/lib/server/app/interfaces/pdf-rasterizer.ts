import { AppError } from '$lib/server/app/error';

export interface PdfRasterizeResult {
	image: Buffer;
	pageCount: number;
}

export interface IPdfRasterizer {
	rasterizeFirstPage(stream: ReadableStream<Uint8Array>): Promise<PdfRasterizeResult>;
}

export class ReceiptRasterizeError extends AppError {
	constructor(
		message = "Couldn't read this PDF — it may be corrupt or password-protected. Try an image instead."
	) {
		super(message, 422);
	}
}
