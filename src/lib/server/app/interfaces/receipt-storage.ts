import { AppError } from '$lib/server/app/error';

export interface ReceiptPutInput {
	mime: string;
	filename?: string;
}

export interface ReceiptPutResult {
	key: string;
}

export interface ReceiptStorageKey {
	key: string;
	createdAt: Date;
}

export interface IReceiptStorageBackend {
	put(stream: ReadableStream<Uint8Array>, input: ReceiptPutInput): Promise<ReceiptPutResult>;
	getReadUrl(key: string, ttlSeconds?: number): Promise<string | null>;
	getStream(key: string): Promise<ReadableStream<Uint8Array>>;
	delete(key: string): Promise<void>;
	listKeys(): Promise<ReceiptStorageKey[]>;
}

export class ReceiptStorageError extends AppError {
	constructor(message = 'Receipt storage is unavailable right now') {
		super(message, 500);
	}
}

export class ReceiptStorageConfigError extends AppError {
	constructor() {
		super('Receipt storage is not configured right now', 500);
	}
}
