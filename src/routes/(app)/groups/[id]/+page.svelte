<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { ArrowLeft, ChevronRight, Plus, ScanLine, Settings } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { formatAmountCents } from '$lib/currency';
	import type { CategoryBreakdownEntry } from '$lib/server/app/dashboard';
	import { BarChart } from 'layerchart';
	import { untrack } from 'svelte';

	const { data } = $props();

	function formatAmount(amountCents: number) {
		return formatAmountCents(amountCents, data.group.currencyCode);
	}

	function monthLabel(month: string) {
		const [year, monthNum] = month.split('-').map(Number);
		return new Date(year, monthNum - 1, 1).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric'
		});
	}

	function currentMonthKey() {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
	}

	type FetchState<T> =
		| { status: 'loading' }
		| { status: 'error' }
		| { status: 'success'; value: T };

	let totalMonth = $state(currentMonthKey());
	let totalState = $state<FetchState<number>>(
		untrack(() => ({
			status: 'success',
			value: data.dashboard.currentMonthTotalCents
		}))
	);

	let breakdownMonth = $state(untrack(() => data.dashboard.months[0] ?? currentMonthKey()));
	let breakdownState = $state<FetchState<Array<CategoryBreakdownEntry>>>(
		untrack(() => ({
			status: 'success',
			value: data.dashboard.categoryBreakdown
		}))
	);

	async function loadMonthTotal(groupId: string, month: string) {
		totalState = { status: 'loading' };
		try {
			const res = await fetch(
				`/groups/${groupId}/dashboard/month-total?month=${encodeURIComponent(month)}`
			);
			if (!res.ok) throw new Error('Failed to load total');
			const { totalCents } = (await res.json()) as { totalCents: number };
			totalState = { status: 'success', value: totalCents };
		} catch {
			totalState = { status: 'error' };
		}
	}

	async function loadMonthBreakdown(groupId: string, month: string) {
		breakdownState = { status: 'loading' };
		try {
			const res = await fetch(
				`/groups/${groupId}/dashboard/month-breakdown?month=${encodeURIComponent(month)}`
			);
			if (!res.ok) throw new Error('Failed to load breakdown');
			const { breakdown } = (await res.json()) as { breakdown: Array<CategoryBreakdownEntry> };
			breakdownState = { status: 'success', value: breakdown };
		} catch {
			breakdownState = { status: 'error' };
		}
	}

	function setTotalMonth(month: string) {
		totalMonth = month;
		loadMonthTotal(data.group.id, month);
	}

	function setBreakdownMonth(month: string) {
		breakdownMonth = month;
		loadMonthBreakdown(data.group.id, month);
	}

	const chartData = $derived(
		breakdownState.status === 'success'
			? breakdownState.value.map((entry) => ({
					name: entry.icon ? `${entry.icon} ${entry.name}` : entry.name,
					amount: entry.amountCents / 100
				}))
			: []
	);

	const chartConfig: Chart.ChartConfig = {
		amount: { label: 'Amount', color: 'var(--chart-1)' }
	};
</script>

<div class="container mx-auto flex max-w-xl flex-col gap-4 p-4">
	<Button variant="ghost" href={resolve('/(app)')} class="-ml-2 w-fit">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold">{data.group.name}</h1>
		<div class="flex gap-2">
			<Button
				variant="outline"
				size="icon"
				href={resolve('/(app)/groups/[id]/settings', { id: data.group.id })}
				aria-label="Settings"
			>
				<Settings class="size-4" />
			</Button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} size="icon" aria-label="Add expense">
							<Plus class="size-4" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-[200px]">
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a
								{...props}
								href={resolve('/(app)/groups/[id]/expenses/new', { id: data.group.id })}
							>
								<Plus class="size-4" />
								Add expense
							</a>
						{/snippet}
					</DropdownMenu.Item>
					{#if data.scannerEnabled}
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a {...props} href={resolve('/(app)/groups/[id]/scan', { id: data.group.id })}>
									<ScanLine class="size-4" />
									Scan receipt
								</a>
							{/snippet}
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	<Card.Root>
		<Card.Header class="flex items-center justify-between">
			<Card.Title>{monthLabel(totalMonth)}</Card.Title>
			{#if data.dashboard.months.length > 0}
				<Select.Root type="single" value={totalMonth} onValueChange={setTotalMonth}>
					<Select.Trigger class="w-[160px]">
						{monthLabel(totalMonth)}
					</Select.Trigger>
					<Select.Content>
						{#each data.dashboard.months as month (month)}
							<Select.Item value={month}>{monthLabel(month)}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			{/if}
		</Card.Header>
		<Card.Content>
			{#if totalState.status === 'loading'}
				<Skeleton class="h-8 w-32" />
			{:else if totalState.status === 'error'}
				<div class="flex items-center gap-2">
					<p class="text-sm text-destructive">Failed to load total.</p>
					<Button variant="outline" size="sm" onclick={() => loadMonthTotal(data.group.id, totalMonth)}>
						Retry
					</Button>
				</div>
			{:else}
				<p class="text-2xl font-semibold">{formatAmount(totalState.value)}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<a
		href={resolve('/(app)/groups/[id]/expenses', { id: data.group.id })}
		class="block no-underline"
	>
		<Card.Root class="transition-colors hover:bg-muted/50">
			<Card.Header class="flex items-center justify-between">
				<Card.Title>View all expenses</Card.Title>
				<Card.Action class="self-center">
					<ChevronRight class="size-4 text-muted-foreground" />
				</Card.Action>
			</Card.Header>
		</Card.Root>
	</a>

	<Card.Root>
		<Card.Header class="flex items-center justify-between">
			<Card.Title>Spend by category</Card.Title>
			{#if data.dashboard.months.length > 0}
				<Select.Root type="single" value={breakdownMonth} onValueChange={setBreakdownMonth}>
					<Select.Trigger class="w-[160px]">
						{monthLabel(breakdownMonth)}
					</Select.Trigger>
					<Select.Content>
						{#each data.dashboard.months as month (month)}
							<Select.Item value={month}>{monthLabel(month)}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			{/if}
		</Card.Header>
		<Card.Content>
			{#if breakdownState.status === 'loading'}
				<Skeleton class="h-[300px] w-full" />
			{:else if breakdownState.status === 'error'}
				<div class="flex items-center gap-2">
					<p class="text-sm text-destructive">Failed to load breakdown.</p>
					<Button
						variant="outline"
						size="sm"
						onclick={() => loadMonthBreakdown(data.group.id, breakdownMonth)}
					>
						Retry
					</Button>
				</div>
			{:else if breakdownState.value.length > 0}
				<Chart.Container config={chartConfig} class="h-[300px] w-full">
					<BarChart
						data={chartData}
						x="amount"
						y="name"
						orientation="horizontal"
						padding={{ left: 80, right: 16, top: 16, bottom: 8 }}
						props={{ bars: { fill: 'var(--color-amount)' } }}
					/>
				</Chart.Container>
			{:else}
				<p class="text-sm text-muted-foreground">No expenses yet</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Average per month</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-semibold">{formatAmount(data.dashboard.averagePerMonthCents)}</p>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Average per day</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-semibold">{formatAmount(data.dashboard.averagePerDayCents)}</p>
		</Card.Content>
	</Card.Root>
</div>
