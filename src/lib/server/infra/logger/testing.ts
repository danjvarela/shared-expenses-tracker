import { NOOP_LOGGER, type ILogger, type LogLevel } from '$lib/server/app/interfaces/logger';

export interface LogEntry {
	level: LogLevel;
	message: string;
	fields: Record<string, unknown>;
}

export function createSilentLogger(): ILogger {
	return NOOP_LOGGER;
}

export function createRecordingLogger(): ILogger & { entries: LogEntry[] } {
	const entries: LogEntry[] = [];

	function make(bound: Record<string, unknown>): ILogger {
		const record = (level: LogLevel, message: string, extra?: Record<string, unknown>) => {
			entries.push({ level, message, fields: { ...bound, ...(extra ?? {}) } });
		};
		return {
			debug: (m, f) => record('debug', m, f),
			info: (m, f) => record('info', m, f),
			warn: (m, f) => record('warn', m, f),
			error: (m, f) => record('error', m, f),
			child: (extra) => make({ ...bound, ...extra })
		};
	}

	return Object.assign(make({}), { entries });
}