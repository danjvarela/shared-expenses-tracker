import { describe, it, expect } from 'vitest';
import { resolveAppEnv } from './app-env';

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
