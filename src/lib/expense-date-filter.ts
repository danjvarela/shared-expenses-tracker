export type DateRangePreset = 'today' | 'this-week' | 'this-month';

export type DateFilterMode = DateRangePreset | 'custom';

export const DATE_PRESET_LABELS: Record<DateRangePreset, string> = {
	today: 'Today',
	'this-week': 'This week',
	'this-month': 'This month'
};

const RANGE_PRESETS = new Set<DateRangePreset>(
	Object.keys(DATE_PRESET_LABELS) as DateRangePreset[]
);

export interface ExpenseDateRange {
	from: Date;
	to: Date;
}

export type DateFilterState =
	| { mode: 'all' }
	| { mode: 'preset'; preset: DateRangePreset }
	| { mode: 'custom'; range: ExpenseDateRange };

export function startOfUtcDay(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUtcDay(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
	);
}

export function dateRangeForPreset(preset: DateRangePreset, now: Date): ExpenseDateRange {
	if (preset === 'today') {
		return { from: startOfUtcDay(now), to: endOfUtcDay(now) };
	}

	if (preset === 'this-month') {
		return {
			from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
			to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))
		};
	}

	const today = startOfUtcDay(now);
	const daysSinceMonday = (now.getUTCDay() + 6) % 7;
	const monday = new Date(today);
	monday.setUTCDate(today.getUTCDate() - daysSinceMonday);
	const sunday = new Date(monday);
	sunday.setUTCDate(monday.getUTCDate() + 6);
	return { from: monday, to: endOfUtcDay(sunday) };
}

export function resolveDateFilterRange(state: DateFilterState, now: Date): ExpenseDateRange | null {
	if (state.mode === 'all') return null;
	if (state.mode === 'preset') return dateRangeForPreset(state.preset, now);
	return state.range;
}

export function toUtcDateString(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function parseUtcDateString(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return date;
}

export function parseDateFilterParams(params: {
	range: string | null;
	from: string | null;
	to: string | null;
}): DateFilterState {
	const range = params.range?.trim() ?? null;
	if (range && RANGE_PRESETS.has(range as DateRangePreset)) {
		return { mode: 'preset', preset: range as DateRangePreset };
	}

	const from = parseUtcDateString(params.from ?? '');
	const to = parseUtcDateString(params.to ?? '');
	if (from && to) {
		const [lo, hi] = from.valueOf() <= to.valueOf() ? [from, to] : [to, from];
		return { mode: 'custom', range: { from: lo, to: endOfUtcDay(hi) } };
	}

	return { mode: 'all' };
}

export function serializeDateFilterParams(state: DateFilterState): {
	range: string | null;
	from: string | null;
	to: string | null;
} {
	if (state.mode === 'preset') {
		return { range: state.preset, from: null, to: null };
	}
	if (state.mode === 'custom') {
		return {
			range: null,
			from: toUtcDateString(state.range.from),
			to: toUtcDateString(state.range.to)
		};
	}
	return { range: null, from: null, to: null };
}

export function dateFilterBadgeLabel(state: DateFilterState): string | null {
	if (state.mode === 'preset') return DATE_PRESET_LABELS[state.preset];
	if (state.mode === 'custom') {
		return `${toUtcDateString(state.range.from)} – ${toUtcDateString(state.range.to)}`;
	}
	return null;
}
