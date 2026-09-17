import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SCRYPT_KEY_LENGTH = 64;

function base64url(bytes: Uint8Array): string {
	const str = btoa(String.fromCharCode(...bytes));
	return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(byteLength = 32): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	return base64url(bytes);
}

export async function sha256Base64url(input: string): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return base64url(new Uint8Array(hash));
}

export async function sha256Hex(input: string): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const derivedKey = (await scryptAsync(password, salt, SCRYPT_KEY_LENGTH)) as Buffer;
	return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [saltHex, keyHex] = stored.split(':');
	if (!saltHex || !keyHex) return false;
	const salt = Buffer.from(saltHex, 'hex');
	const expectedKey = Buffer.from(keyHex, 'hex');
	const derivedKey = (await scryptAsync(password, salt, expectedKey.length)) as Buffer;
	return timingSafeEqual(derivedKey, expectedKey);
}
