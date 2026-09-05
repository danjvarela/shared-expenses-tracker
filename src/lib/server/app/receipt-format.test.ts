import { describe, it, expect } from 'vitest';
import {
	sniffMime,
	ALLOWED_RECEIPT_MIMES,
	PDF_MIME,
	JPEG_MIME,
	PNG_MIME,
	WEBP_MIME,
	HEIC_MIME,
	HEIF_MIME,
	AVIF_MIME
} from './receipt-format';

function ftyp(brand: string): Uint8Array {
	const buf = Buffer.alloc(16);
	buf.writeUInt32BE(buf.length, 0);
	Buffer.from('ftyp', 'latin1').copy(buf, 4);
	Buffer.from(brand, 'latin1').copy(buf, 8);
	return new Uint8Array(buf);
}

describe('sniffMime', () => {
	it('detects a PDF by the %PDF- magic', () => {
		expect(sniffMime(new Uint8Array(Buffer.from('%PDF-1.4 ...')))).toBe(PDF_MIME);
	});

	it('detects a PNG by its 8-byte signature', () => {
		expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe(
			PNG_MIME
		);
	});

	it('detects a JPEG by the FFD8FF magic', () => {
		expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe(JPEG_MIME);
	});

	it('detects a WebP by the RIFF/WEBP container signature', () => {
		const buf = Buffer.alloc(14);
		Buffer.from('RIFF', 'latin1').copy(buf, 0);
		buf.writeUInt32LE(6, 4);
		Buffer.from('WEBP', 'latin1').copy(buf, 8);
		expect(sniffMime(new Uint8Array(buf))).toBe(WEBP_MIME);
	});

	it('detects an HEIC file by its heic ftyp brand', () => {
		expect(sniffMime(ftyp('heic'))).toBe(HEIC_MIME);
	});

	it('detects an Apple heix-branded HEIC file', () => {
		expect(sniffMime(ftyp('heix'))).toBe(HEIC_MIME);
	});

	it('detects a generic HEIF file by a mif1 ftyp brand', () => {
		expect(sniffMime(ftyp('mif1'))).toBe(HEIF_MIME);
	});

	it('detects an AVIF file by its avif ftyp brand', () => {
		expect(sniffMime(ftyp('avif'))).toBe(AVIF_MIME);
	});

	it('detects an AVIF sequence by its avis ftyp brand', () => {
		expect(sniffMime(ftyp('avis'))).toBe(AVIF_MIME);
	});

	it('returns null for an unsupported type', () => {
		expect(sniffMime(new Uint8Array(Buffer.from('GIF89a')))).toBeNull();
		expect(sniffMime(new Uint8Array([0x42, 0x4d]))).toBeNull();
	});

	it('returns null for too few bytes', () => {
		expect(sniffMime(new Uint8Array([0x89, 0x50]))).toBeNull();
		expect(sniffMime(new Uint8Array([]))).toBeNull();
	});

	it('returns null for a RIFF container that is not WebP', () => {
		const buf = Buffer.alloc(12);
		Buffer.from('RIFF', 'latin1').copy(buf, 0);
		Buffer.from('WAVE', 'latin1').copy(buf, 8);
		expect(sniffMime(new Uint8Array(buf))).toBeNull();
	});

	it('returns null for an ISO BMFF ftyp with an unknown brand', () => {
		expect(sniffMime(ftyp('qt  '))).toBeNull();
	});

	it('ignores a spoofed Content-Type — a body with no known magic is rejected', () => {
		expect(sniffMime(new Uint8Array(Buffer.from('not an image')))).toBeNull();
	});

	it('classifies by actual bytes, not the claimed type: a PNG body sniffs as PNG even if a client claims JPEG', () => {
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		expect(sniffMime(png)).toBe(PNG_MIME);
	});
});

describe('ALLOWED_RECEIPT_MIMES', () => {
	it('contains exactly the sniffed set of receipt formats', () => {
		expect([...ALLOWED_RECEIPT_MIMES].sort()).toEqual(
			[PDF_MIME, JPEG_MIME, PNG_MIME, WEBP_MIME, HEIC_MIME, HEIF_MIME, AVIF_MIME].sort()
		);
	});

	it('every sniffed mime is in the allow-list (sniff never returns a mime the gate would reject)', () => {
		const samples: Uint8Array[] = [
			new Uint8Array(Buffer.from('%PDF-1.4')),
			new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			new Uint8Array([0xff, 0xd8, 0xff]),
			(() => {
				const buf = Buffer.alloc(12);
				Buffer.from('RIFF', 'latin1').copy(buf, 0);
				Buffer.from('WEBP', 'latin1').copy(buf, 8);
				return new Uint8Array(buf);
			})(),
			ftyp('heic'),
			ftyp('mif1'),
			ftyp('avif')
		];
		for (const bytes of samples) {
			const mime = sniffMime(bytes);
			expect(mime).not.toBeNull();
			expect(ALLOWED_RECEIPT_MIMES.has(mime as string)).toBe(true);
		}
	});
});
