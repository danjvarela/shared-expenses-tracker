import { describe, it, expect } from 'vitest';
import {
	dateRangeForPreset,
	resolveDateFilterRange,
	parseDateFilterParams,
	serializeDateFilterParams,
	dateFilterBadgeLabel,
	toUtcDateString,
	parseUtcDateString,
	startOfUtcDay,
	endOfUtcDay,
	type DateFilterState
} from './expense-date-filter';

const NOW = new Date(Date.UTC(2026, 8, 4, 14, 30, 0)); // 2026-09-04 14:30 UTC, a Friday

describe('startOfUtcDay / endOfUtcDay', () => {
	it('floors a date to UTC midnight', () => {
		expect(startOfUtcDay(NOW).valueOf()).toBe(Date.UTC(2026, 8, 4));
	});

	it('caps a date to the last millisecond of its UTC day', () => {
		expect(endOfUtcDay(NOW).valueOf()).toBe(Date.UTC(2026, 8, 4, 23, 59, 59, 999));
	});
});

describe('dateRangeForPreset', () => {
	it('today spans the current UTC day inclusive', () => {
		expect(dateRangeForPreset('today', NOW)).toEqual({
			from: new Date(Date.UTC(2026, 8, 4)),
			to: new Date(Date.UTC(2026, 8, 4, 23, 59, 59, 999))
		});
	});

	it('this-month spans the first to last day of the current UTC month', () => {
		expect(dateRangeForPreset('this-month', NOW)).toEqual({
			from: new Date(Date.UTC(2026, 8, 1)),
			to: new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999))
		});
	});

	it('this-month handles month wrap into December', () => {
		const dec = new Date(Date.UTC(2026, 11, 15));
		expect(dateRangeForPreset('this-month', dec)).toEqual({
			from: new Date(Date.UTC(2026, 11, 1)),
			to: new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999))
		});
	});

	it('this-week spans Monday to Sunday of the current UTC week', () => {
		// 2026-09-04 is a Friday; Monday is 2026-08-31, Sunday is 2026-09-06
		expect(dateRangeForPreset('this-week', NOW)).toEqual({
			from: new Date(Date.UTC(2026, 7, 31)),
			to: new Date(Date.UTC(2026, 8, 6, 23, 59, 59, 999))
		});
	});

	it('this-week rolls back to the previous month when Monday is earlier', () => {
		expect(dateRangeForPreset('this-week', NOW).from.valueOf()).toBe(Date.UTC(2026, 7, 31));
	});

	it('this-week on a Monday starts that same Monday', () => {
		const monday = new Date(Date.UTC(2026, 8, 7, 3, 0, 0)); // 2026-09-07 Monday
		expect(dateRangeForPreset('this-week', monday)).toEqual({
			from: new Date(Date.UTC(2026, 8, 7)),
			to: new Date(Date.UTC(2026, 8, 13, 23, 59, 59, 999))
		});
	});

	it('this-week on a Sunday ends that same Sunday', () => {
		const sunday = new Date(Date.UTC(2026, 8, 6, 20, 0, 0)); // 2026-09-06 Sunday
		expect(dateRangeForPreset('this-week', sunday).to.valueOf()).toBe(
			Date.UTC(2026, 8, 6, 23, 59, 59, 999)
		);
	});
});

describe('resolveDateFilterRange', () => {
	it('returns null for all-time mode', () => {
		expect(resolveDateFilterRange({ mode: 'all' }, NOW)).toBeNull();
	});

	it('resolves a preset to its date range', () => {
		expect(resolveDateFilterRange({ mode: 'preset', preset: 'today' }, NOW)).toEqual(
			dateRangeForPreset('today', NOW)
		);
	});

	it('returns the custom range directly', () => {
		const range = { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 0, 31)) };
		expect(resolveDateFilterRange({ mode: 'custom', range }, NOW)).toBe(range);
	});
});

describe('toUtcDateString / parseUtcDateString', () => {
	it('formats a date as YYYY-MM-DD in UTC', () => {
		expect(toUtcDateString(new Date(Date.UTC(2026, 0, 9)))).toBe('2026-01-09');
	});

	it('parses a valid YYYY-MM-DD string to a UTC midnight date', () => {
		expect(parseUtcDateString('2026-01-09')?.valueOf()).toBe(Date.UTC(2026, 0, 9));
	});

	it('rejects malformed strings', () => {
		expect(parseUtcDateString('2026-1-9')).toBeNull();
		expect(parseUtcDateString('not-a-date')).toBeNull();
		expect(parseUtcDateString('')).toBeNull();
	});

	it('rejects out-of-range calendar values', () => {
		expect(parseUtcDateString('2026-13-01')).toBeNull();
		expect(parseUtcDateString('2026-02-31')).toBeNull();
	});
});

describe('parseDateFilterParams', () => {
	it('returns all-time when no params are present', () => {
		expect(parseDateFilterParams({ range: null, from: null, to: null })).toEqual({
			mode: 'all'
		});
	});

	it('parses a known preset', () => {
		expect(parseDateFilterParams({ range: 'today', from: null, to: null })).toEqual({
			mode: 'preset',
			preset: 'today'
		});
		expect(parseDateFilterParams({ range: 'this-week', from: null, to: null })).toEqual({
			mode: 'preset',
			preset: 'this-week'
		});
	});

	it('parses a custom range from from/to', () => {
		expect(parseDateFilterParams({ range: null, from: '2026-01-01', to: '2026-01-31' })).toEqual({
			mode: 'custom',
			range: {
				from: new Date(Date.UTC(2026, 0, 1)),
				to: new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999))
			}
		});
	});

	it('normalizes a reversed custom range', () => {
		const parsed = parseDateFilterParams({
			range: null,
			from: '2026-01-31',
			to: '2026-01-01'
		});
		expect(parsed).toEqual({
			mode: 'custom',
			range: {
				from: new Date(Date.UTC(2026, 0, 1)),
				to: new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999))
			}
		});
	});

	it('falls back to all-time when only one of from/to is present', () => {
		expect(parseDateFilterParams({ range: null, from: '2026-01-01', to: null })).toEqual({
			mode: 'all'
		});
	});

	it('falls back to all-time when custom dates are invalid', () => {
		expect(parseDateFilterParams({ range: null, from: 'bad', to: '2026-01-01' })).toEqual({
			mode: 'all'
		});
	});

	it('ignores an unknown range value', () => {
		expect(parseDateFilterParams({ range: 'yesterday', from: null, to: null })).toEqual({
			mode: 'all'
		});
	});
});

describe('serializeDateFilterParams', () => {
	it('serializes a preset to range only', () => {
		expect(serializeDateFilterParams({ mode: 'preset', preset: 'this-month' })).toEqual({
			range: 'this-month',
			from: null,
			to: null
		});
	});

	it('serializes a custom range to from/to only', () => {
		expect(
			serializeDateFilterParams({
				mode: 'custom',
				range: { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 0, 31)) }
			})
		).toEqual({ range: null, from: '2026-01-01', to: '2026-01-31' });
	});

	it('serializes all-time to all nulls', () => {
		expect(serializeDateFilterParams({ mode: 'all' })).toEqual({
			range: null,
			from: null,
			to: null
		});
	});

	it('round-trips a preset through parse + serialize', () => {
		const state: DateFilterState = { mode: 'preset', preset: 'today' };
		const serialized = serializeDateFilterParams(state);
		expect(parseDateFilterParams(serialized)).toEqual(state);
	});

	it('round-trips a custom range through parse + serialize', () => {
		const state: DateFilterState = {
			mode: 'custom',
			range: {
				from: new Date(Date.UTC(2026, 2, 10)),
				to: new Date(Date.UTC(2026, 2, 20, 23, 59, 59, 999))
			}
		};
		const serialized = serializeDateFilterParams(state);
		expect(parseDateFilterParams(serialized)).toEqual(state);
	});
});

describe('dateFilterBadgeLabel', () => {
	it('returns null for all-time', () => {
		expect(dateFilterBadgeLabel({ mode: 'all' })).toBeNull();
	});

	it('returns the preset label for preset modes', () => {
		expect(dateFilterBadgeLabel({ mode: 'preset', preset: 'today' })).toBe('Today');
		expect(dateFilterBadgeLabel({ mode: 'preset', preset: 'this-week' })).toBe('This week');
		expect(dateFilterBadgeLabel({ mode: 'preset', preset: 'this-month' })).toBe('This month');
	});

	it('returns a from – to string for a custom range', () => {
		expect(
			dateFilterBadgeLabel({
				mode: 'custom',
				range: { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 0, 31)) }
			})
		).toBe('2026-01-01 – 2026-01-31');
	});
});
