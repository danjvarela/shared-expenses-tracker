import { describe, it, expect } from 'vitest';
import { resolveAppEnv, assertOAuthLoginAllowed } from './app-env';

describe('resolveAppEnv', () => {
	it('defaults to development when unset', () => {
		expect(resolveAppEnv(undefined)).toBe('development');
	});

	it('resolves development', () => {
		expect(resolveAppEnv('development')).toBe('development');
	});

	it('resolves production', () => {
		expect(resolveAppEnv('production')).toBe('production');
	});

	it('resolves demo', () => {
		expect(resolveAppEnv('demo')).toBe('demo');
	});

	it('throws on an unknown value', () => {
		expect(() => resolveAppEnv('staging')).toThrow('Invalid APP_ENV: staging');
	});
});

describe('assertOAuthLoginAllowed', () => {
	it('rejects with a 403 in the demo environment', () => {
		expect(() => assertOAuthLoginAllowed('demo')).toThrow(expect.objectContaining({ status: 403 }));
	});

	it('does not throw in development or production', () => {
		expect(() => assertOAuthLoginAllowed('development')).not.toThrow();
		expect(() => assertOAuthLoginAllowed('production')).not.toThrow();
	});
});
