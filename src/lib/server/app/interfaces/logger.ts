export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ILogger {
	debug(message: string, fields?: Record<string, unknown>): void;
	info(message: string, fields?: Record<string, unknown>): void;
	warn(message: string, fields?: Record<string, unknown>): void;
	error(message: string, fields?: Record<string, unknown>): void;
	child(fields: Record<string, unknown>): ILogger;
}

const noop = () => {};

export const NOOP_LOGGER: ILogger = {
	debug: noop,
	info: noop,
	warn: noop,
	error: noop,
	child: () => NOOP_LOGGER
};