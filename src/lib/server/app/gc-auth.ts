import { createHash, timingSafeEqual } from 'node:crypto';

function sha256(input: string): Buffer {
	return createHash('sha256').update(input).digest();
}

export function tokenMatches(provided: string | null, expected: string): boolean {
	if (!provided) return false;
	return timingSafeEqual(sha256(provided), sha256(expected));
}
