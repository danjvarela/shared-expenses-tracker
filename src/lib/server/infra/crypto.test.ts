import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './crypto';

describe('hashPassword / verifyPassword', () => {
	it('verifies a correct password against its hash', async () => {
		const hash = await hashPassword('correct-password');
		expect(await verifyPassword('correct-password', hash)).toBe(true);
	});

	it('rejects an incorrect password', async () => {
		const hash = await hashPassword('correct-password');
		expect(await verifyPassword('wrong-password', hash)).toBe(false);
	});

	it('produces different hashes for the same password (random salt)', async () => {
		const a = await hashPassword('same-password');
		const b = await hashPassword('same-password');
		expect(a).not.toBe(b);
	});

	it('rejects a malformed stored hash', async () => {
		expect(await verifyPassword('anything', 'not-a-valid-hash')).toBe(false);
	});
});
