import { AppError } from '$lib/server/app/error';

export interface FilePutInput {
	mime: string;
	filename?: string;
}

export interface FilePutResult {
	key: string;
}

export interface FileStorageKey {
	key: string;
	createdAt: Date;
}

export interface IFileStorageBackend {
	put(stream: ReadableStream<Uint8Array>, input: FilePutInput): Promise<FilePutResult>;
	getReadUrl(key: string, ttlSeconds?: number): Promise<string | null>;
	getStream(key: string): Promise<ReadableStream<Uint8Array>>;
	delete(key: string): Promise<void>;
	listKeys(): Promise<FileStorageKey[]>;
}

export class FileStorageError extends AppError {
	constructor(message = 'File storage is unavailable right now') {
		super(message, 500);
	}
}

export class FileStorageConfigError extends AppError {
	constructor() {
		super('File storage is not configured right now', 500);
	}
}