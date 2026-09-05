import { AppError } from '$lib/server/app/error';

export interface NormalizedReceipt {
	bytes: Uint8Array;
	mime: string;
}

export interface IReceiptNormalizer {
	normalize(bytes: Uint8Array, mime: string): Promise<NormalizedReceipt>;
}

export class ReceiptNormalizeError extends AppError {
	constructor(message = 'Could not process this receipt. Try a different file.') {
		super(message, 422);
	}
}
