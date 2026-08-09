import { fail, error, type ActionFailure } from '@sveltejs/kit';
import { AppError } from '$lib/server/app/error';

export function toActionResult(err: unknown): ActionFailure<{ message: string }> {
	if (err instanceof AppError && err.status >= 400 && err.status < 500) {
		return fail(err.status, { message: err.message });
	}
	throw err;
}

export function toHttpError(err: unknown): never {
	if (err instanceof AppError) {
		error(err.status, err.message);
	}
	throw err;
}