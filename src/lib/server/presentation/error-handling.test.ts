import { describe, it, expect } from 'vitest';
import { isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import { AppError } from '$lib/server/app/error';
import { toActionResult, toHttpError } from './error-handling';

describe('toActionResult', () => {
	it('maps a 4xx AppError to a fail with the message', () => {
		const result = toActionResult(new AppError('nope', 400));

		expect(result.status).toBe(400);
		expect(result.data).toEqual({ message: 'nope' });
	});

	it('maps a 404 AppError to a fail', () => {
		const result = toActionResult(new AppError('missing', 404));

		expect(result.status).toBe(404);
		expect(result.data).toEqual({ message: 'missing' });
	});

	it('rethrows a 5xx AppError', () => {
		expect(() => toActionResult(new AppError('boom', 500))).toThrowError('boom');
	});

	it('rethrows a non-AppError', () => {
		expect(() => toActionResult(new Error('unexpected'))).toThrowError('unexpected');
	});

	it('preserves a SvelteKit redirect thrown upstream', () => {
		let redirectErr: unknown;
		try {
			redirect(303, '/elsewhere');
		} catch (e) {
			redirectErr = e;
		}

		expect(isRedirect(redirectErr)).toBe(true);
		expect(() => toActionResult(redirectErr)).toThrow();
	});
});

describe('toHttpError', () => {
	it('throws an HttpError for an AppError', () => {
		try {
			toHttpError(new AppError('bad', 404));
			throw new Error('should have thrown');
		} catch (e) {
			expect(isHttpError(e)).toBe(true);
			expect((e as { status: number }).status).toBe(404);
			expect((e as { body: { message: string } }).body.message).toBe('bad');
		}
	});

	it('throws an HttpError for a 5xx AppError', () => {
		try {
			toHttpError(new AppError('down', 502));
			throw new Error('should have thrown');
		} catch (e) {
			expect(isHttpError(e)).toBe(true);
			expect((e as { status: number }).status).toBe(502);
		}
	});

	it('rethrows a non-AppError', () => {
		expect(() => toHttpError(new Error('unexpected'))).toThrowError('unexpected');
	});
});