export const PDF_MIME = 'application/pdf';
export const JPEG_MIME = 'image/jpeg';
export const PNG_MIME = 'image/png';
export const WEBP_MIME = 'image/webp';
export const HEIC_MIME = 'image/heic';
export const HEIF_MIME = 'image/heif';
export const AVIF_MIME = 'image/avif';

export const ALLOWED_RECEIPT_MIMES = new Set<string>([
	PDF_MIME,
	JPEG_MIME,
	PNG_MIME,
	WEBP_MIME,
	HEIC_MIME,
	HEIF_MIME,
	AVIF_MIME
]);

export type SniffedMime =
	| typeof PDF_MIME
	| typeof JPEG_MIME
	| typeof PNG_MIME
	| typeof WEBP_MIME
	| typeof HEIC_MIME
	| typeof HEIF_MIME
	| typeof AVIF_MIME;

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF = Buffer.from('RIFF', 'latin1');
const WEBP = Buffer.from('WEBP', 'latin1');
const FTYP = Buffer.from('ftyp', 'latin1');

const HEIC_BRANDS = new Set(['heic', 'heix']);
const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIF_BRANDS = new Set(['mif1', 'mif2', 'heim', 'heis']);

function startsWith(buf: Buffer, magic: Buffer): boolean {
	return buf.length >= magic.length && buf.subarray(0, magic.length).equals(magic);
}

export function sniffMime(bytes: Uint8Array): SniffedMime | null {
	const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	if (startsWith(buf, PDF_MAGIC)) return PDF_MIME;
	if (startsWith(buf, PNG_MAGIC)) return PNG_MIME;
	if (startsWith(buf, JPEG_MAGIC)) return JPEG_MIME;

	if (buf.length >= 12 && buf.subarray(0, 4).equals(RIFF) && buf.subarray(8, 12).equals(WEBP)) {
		return WEBP_MIME;
	}

	if (buf.length >= 12 && buf.subarray(4, 8).equals(FTYP)) {
		const brand = buf.subarray(8, 12).toString('latin1');
		if (HEIC_BRANDS.has(brand)) return HEIC_MIME;
		if (AVIF_BRANDS.has(brand)) return AVIF_MIME;
		if (HEIF_BRANDS.has(brand)) return HEIF_MIME;
	}

	return null;
}
