import { AppError } from '$lib/server/app/error';

export interface ReceiptScanLineItem {
	description: string;
	amountDecimal: string;
}

export interface ScanResult {
	merchant?: string;
	date?: string;
	totalDecimal?: string;
	lineItems: ReceiptScanLineItem[];
}

export interface IReceiptScanner {
	scan(stream: ReadableStream<Uint8Array>, mime: string): Promise<ScanResult>;
}

export class ReceiptScannerError extends AppError {
	constructor(message = 'Receipt scanning is unavailable right now') {
		super(message, 500);
	}
}

export class ReceiptScannerConfigError extends AppError {
	constructor() {
		super('Receipt scanning is not configured right now', 500);
	}
}