import { type ILogger, type LogLevel } from '$lib/server/app/interfaces/logger';

export type { ILogger, LogLevel } from '$lib/server/app/interfaces/logger';
export { NOOP_LOGGER } from '$lib/server/app/interfaces/logger';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function timestamp(): string {
	const d = new Date();
	const pad = (n: number, len = 2) => String(n).padStart(len, '0');
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
		d.getMilliseconds(),
		3
	)}`;
}

// Long hex-with-hyphens values (uuids) are truncated to 8 chars for readability;
// short ids, component names, mime types, and storage keys are left intact.
function renderValue(value: unknown): string {
	if (typeof value === 'string') {
		if (/^[0-9a-f-]{20,}$/i.test(value)) return value.slice(0, 8);
		return value;
	}
	if (value instanceof Error) {
		let s = `${value.name}: ${value.message}`;
		let cause = value.cause;
		while (cause instanceof Error) {
			s += ` — caused by ${cause.name}: ${cause.message}`;
			cause = cause.cause;
		}
		return s;
	}
	return String(value);
}

function formatFields(fields: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(fields)) {
		parts.push(`${key}=${renderValue(value)}`);
	}
	return parts.join(' ');
}

function describeError(fields: Record<string, unknown>): { fields: Record<string, unknown>; stack?: string } {
	const { err, ...rest } = fields;
	const out: Record<string, unknown> = { ...rest };
	let stack: string | undefined;
	if (err instanceof Error) {
		out.err = `${err.name}: ${err.message}`;
		stack = err.stack;
	} else if (err !== undefined) {
		out.err = String(err);
	}
	return { fields: out, stack };
}

function createConsoleLogger(
	level: LogLevel,
	bound: Record<string, unknown>
): ILogger {
	const minOrder = LEVEL_ORDER[level];

	function emit(lvl: LogLevel, message: string, extra?: Record<string, unknown>) {
		if (LEVEL_ORDER[lvl] < minOrder) return;
		const merged = { ...bound, ...extra };
		const { fields, stack } =
			lvl === 'error' ? describeError(merged) : { fields: merged, stack: undefined };
		const prefix = `[${lvl}] ${timestamp()}`;
		const body = formatFields(fields);
		const line = body ? `${prefix} ${message} ${body}` : `${prefix} ${message}`;
		const fn = lvl === 'error' ? console.error : lvl === 'warn' ? console.warn : console.log;
		fn(line);
		if (stack) console.error(stack);
	}

	return {
		debug: (m, f) => emit('debug', m, f),
		info: (m, f) => emit('info', m, f),
		warn: (m, f) => emit('warn', m, f),
		error: (m, f) => emit('error', m, f),
		child: (extra) => createConsoleLogger(level, { ...bound, ...extra })
	};
}

export function createLogger(opts: { level?: LogLevel } = {}): ILogger {
	const level = opts.level ?? 'info';
	return createConsoleLogger(level, {});
}