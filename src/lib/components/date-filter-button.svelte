<script lang="ts">
	import { CalendarRange } from '@lucide/svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as RangeCalendar from '$lib/components/ui/range-calendar/index.js';
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import { type DateRange } from 'bits-ui';
	import {
		DATE_PRESET_LABELS,
		endOfUtcDay,
		type DateFilterMode,
		type DateFilterState,
		type DateRangePreset
	} from '$lib/expense-date-filter';

	let {
		filterState,
		onSelect
	}: { filterState: DateFilterState; onSelect: (state: DateFilterState) => void } = $props();

	const MODE_ORDER: DateFilterMode[] = ['today', 'this-week', 'this-month', 'custom'];

	let open = $state(false);
	let calendarOpen = $state(false);
	let rangeValue = $state<DateRange | undefined>(undefined);
	let placeholder = $state<CalendarDate>(toCalendarDate(new Date()));
	let lastAppliedKey = '';

	const isActive = $derived(filterState.mode !== 'all');
	const showCalendar = $derived(calendarOpen || filterState.mode === 'custom');

	function toCalendarDate(date: Date): CalendarDate {
		return new CalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
	}

	function fromCalendarDate(value: DateValue): Date {
		return new Date(Date.UTC(value.year, value.month - 1, value.day));
	}

	function toCustomRange(value: DateRange) {
		return {
			from: fromCalendarDate(value.start as DateValue),
			to: endOfUtcDay(fromCalendarDate(value.end as DateValue))
		};
	}

	$effect(() => {
		if (!open) calendarOpen = false;
	});

	$effect(() => {
		if (filterState.mode !== 'custom') return;
		const key = `${filterState.range.from.valueOf()}-${filterState.range.to.valueOf()}`;
		if (key === lastAppliedKey) return;
		lastAppliedKey = key;
		rangeValue = {
			start: toCalendarDate(filterState.range.from),
			end: toCalendarDate(filterState.range.to)
		};
		placeholder = toCalendarDate(filterState.range.from);
	});

	function choosePreset(preset: DateRangePreset) {
		onSelect({ mode: 'preset', preset });
		open = false;
	}

	function revealCustom() {
		calendarOpen = true;
	}

	function handleRangeChange(value: DateRange | undefined) {
		rangeValue = value;
		if (value?.start && value?.end) {
			onSelect({ mode: 'custom', range: toCustomRange(value) });
		}
	}

	function modeLabel(mode: DateFilterMode): string {
		return mode === 'custom' ? 'Custom range' : DATE_PRESET_LABELS[mode];
	}

	function isModeActive(mode: DateFilterMode): boolean {
		if (mode === 'custom') return filterState.mode === 'custom';
		return filterState.mode === 'preset' && filterState.preset === mode;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<div class="relative">
				<Button {...props} variant="outline" size="icon" aria-label="Filter by date">
					<CalendarRange class="size-4" />
				</Button>
				{#if isActive}
					<span class="absolute top-1 right-1 size-2 rounded-full bg-primary" aria-hidden="true"
					></span>
				{/if}
			</div>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-[320px]">
		<div class="flex flex-col gap-1">
			<Button
				variant={filterState.mode === 'all' ? 'secondary' : 'ghost'}
				size="sm"
				class="justify-start"
				onclick={() => {
					onSelect({ mode: 'all' });
					open = false;
				}}
			>
				All time
			</Button>
			{#each MODE_ORDER as mode (mode)}
				<Button
					variant={isModeActive(mode) ? 'secondary' : 'ghost'}
					size="sm"
					class="justify-start"
					onclick={() => (mode === 'custom' ? revealCustom() : choosePreset(mode))}
				>
					{modeLabel(mode)}
				</Button>
			{/each}
		</div>
		{#if showCalendar}
			<div class="mt-2 border-t pt-2">
				<RangeCalendar.RangeCalendar
					bind:value={rangeValue}
					bind:placeholder
					numberOfMonths={2}
					pagedNavigation
					onValueChange={handleRangeChange}
				/>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>
