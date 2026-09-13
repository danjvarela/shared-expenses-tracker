import { ALLOWED_RECEIPT_MIMES, PDF_MIME } from '$lib/server/app/receipt-format';

export const ALLOWED_AVATAR_MIMES = new Set<string>(
	[...ALLOWED_RECEIPT_MIMES].filter((mime) => mime !== PDF_MIME)
);

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const AVATAR_LONG_EDGE = 512;
