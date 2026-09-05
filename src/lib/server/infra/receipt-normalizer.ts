import { spawn } from 'node:child_process';
import { JPEG_MIME, PDF_MIME } from '$lib/server/app/receipt-format';
import {
	ReceiptNormalizeError,
	type IReceiptNormalizer,
	type NormalizedReceipt
} from '$lib/server/app/interfaces/receipt-normalizer';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';
import { prepareImage, type SpawnFn } from '$lib/server/infra/image-prep';
import type { IPdfProcessor } from '$lib/server/infra/pdf';

function bufferToStream(buf: Uint8Array): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(buf);
			controller.close();
		}
	});
}

export interface CreateReceiptNormalizerOptions {
	pdfProcessor: IPdfProcessor;
	spawn?: SpawnFn;
	logger?: ILogger;
}

export function createReceiptNormalizer({
	pdfProcessor,
	spawn: spawnFn = spawn,
	logger = NOOP_LOGGER
}: CreateReceiptNormalizerOptions): IReceiptNormalizer {
	return {
		async normalize(bytes, mime): Promise<NormalizedReceipt> {
			try {
				if (mime === PDF_MIME) {
					const compressed = await pdfProcessor.compress(bufferToStream(bytes));
					return { bytes: new Uint8Array(compressed), mime: PDF_MIME };
				}
				const jpeg = await prepareImage(Buffer.from(bytes), spawnFn, logger);
				return { bytes: new Uint8Array(jpeg), mime: JPEG_MIME };
			} catch (err) {
				const wrapped = new ReceiptNormalizeError();
				wrapped.cause = err;
				throw wrapped;
			}
		}
	};
}
