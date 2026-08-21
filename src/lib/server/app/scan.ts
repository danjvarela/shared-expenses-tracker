import { basename } from 'node:path';
import {
	ReceiptMimeNotAllowedError,
	ReceiptNotAuthorizedError,
	ReceiptTooLargeError,
	MAX_RECEIPT_BYTES
} from '$lib/server/app/receipt';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type { IReceiptScanner, ScanResult } from '$lib/server/app/interfaces/receipt-scanner';
import {
	ReceiptRasterizeError,
	type IPdfRasterizer
} from '$lib/server/app/interfaces/pdf-rasterizer';
import type { IReceiptStorageBackend } from '$lib/server/app/interfaces/receipt-storage';

export { ReceiptRasterizeError } from '$lib/server/app/interfaces/pdf-rasterizer';

export const PDF_MIME = 'application/pdf';
export const PNG_MIME = 'image/png';
export const JPEG_MIME = 'image/jpeg';

export const ALLOWED_SCAN_MIMES = new Set<string>([PDF_MIME, PNG_MIME, JPEG_MIME]);

export type SniffedMime = typeof PDF_MIME | typeof PNG_MIME | typeof JPEG_MIME;

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

export function sniffMime(bytes: Uint8Array): SniffedMime | null {
	const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (buf.length >= PDF_MAGIC.length && buf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
		return PDF_MIME;
	}
	if (buf.length >= PNG_MAGIC.length && buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
		return PNG_MIME;
	}
	if (buf.length >= JPEG_MAGIC.length && buf.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
		return JPEG_MIME;
	}
	return null;
}

export interface ScanInput {
	groupId: string;
	stream: ReadableStream<Uint8Array>;
	sniffedMime: string;
	filename?: string;
	sizeBytes: number;
}

export interface ScanOutput {
	scanResult: ScanResult;
	storageKey: string;
}

export interface ScanServiceDeps {
	storageBackend: IReceiptStorageBackend;
	scanner: IReceiptScanner;
	groupMemberRepo: IGroupMemberRepository;
	rasterizer: IPdfRasterizer;
}

function sanitizeFilename(filename: string | undefined): string | null {
	if (!filename) return null;
	const base = basename(filename);
	if (!base || base === '.') return null;
	return base.slice(0, 255);
}

function bufferToStream(buf: Buffer): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array(buf));
			controller.close();
		}
	});
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(1)} ${units[unit]}`;
}

export function createScanService(deps: ScanServiceDeps) {
	async function scan(actorUserId: string, input: ScanInput): Promise<ScanOutput> {
		console.log('scan request started', { originalUploadSize: formatBytes(input.sizeBytes) });

		const isMember = await deps.groupMemberRepo.isMember(input.groupId, actorUserId);
		if (!isMember) throw new ReceiptNotAuthorizedError();

		if (input.sizeBytes > MAX_RECEIPT_BYTES) throw new ReceiptTooLargeError();
		if (!ALLOWED_SCAN_MIMES.has(input.sniffedMime)) throw new ReceiptMimeNotAllowedError();

		const { key } = await deps.storageBackend.put(input.stream, {
			mime: input.sniffedMime,
			filename: sanitizeFilename(input.filename) ?? undefined
		});

		// Put-first, no-persist: bytes are stored, then read back to feed the
		// scanner. Nothing is rolled back — a failure or a discarded draft
		// leaves the bytes orphaned (gc'd later).
		const stored = await deps.storageBackend.getStream(key);

		let scanStream: ReadableStream<Uint8Array>;
		let scanMime: string;
		if (input.sniffedMime === PDF_MIME) {
			const { image, pageCount } = await deps.rasterizer.rasterizeFirstPage(stored);
			if (pageCount > 1) {
				throw new ReceiptRasterizeError(
					'This PDF has multiple pages. Only single-page receipts are supported.'
				);
			}
			scanStream = bufferToStream(image);
			scanMime = PNG_MIME;
		} else {
			scanStream = stored;
			scanMime = input.sniffedMime;
		}

		const scanResult = await deps.scanner.scan(scanStream, scanMime);
		return { scanResult, storageKey: key };
	}

	return { scan };
}

export type ScanService = ReturnType<typeof createScanService>;
