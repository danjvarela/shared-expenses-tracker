import { enhance as kitEnhance } from '$app/forms';
import type { SubmitFunction } from '@sveltejs/kit';

/** Wraps `enhance` with a reactive `pending` flag; passes the submit fn through. */
export function useFormPending() {
	let pending = $state(false);

	function enhance(form: HTMLFormElement, submit?: SubmitFunction) {
		return kitEnhance(form, async (ctx) => {
			pending = true;
			const resultHandler = await submit?.(ctx);
			return async (args) => {
				try {
					if (resultHandler) {
						await resultHandler(args);
					} else {
						await args.update();
					}
				} finally {
					pending = false;
				}
			};
		});
	}

	return {
		enhance,
		get pending() {
			return pending;
		}
	};
}