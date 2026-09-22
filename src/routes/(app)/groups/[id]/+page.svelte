<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { ArrowLeft, ChevronRight, Plus, ScanLine, Settings } from '@lucide/svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { formatAmountCents } from '$lib/currency';
	import { BarChart } from 'layerchart';

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

	const selectedMonth = $derived(page.url.searchParams.get('month') ?? currentMonthKey());

	function setMonth(month: string) {
		const url = new URL(page.url);
		url.searchParams.set('month', month);
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	const chartData = $derived(
		data.dashboard.categoryBreakdown.map((entry) => ({
			name: entry.icon ? `${entry.icon} ${entry.name}` : entry.name,
			amount: entry.amountCents / 100
		}))
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
		<Card.Header>
			<Card.Title>This month</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-2xl font-semibold">{formatAmount(data.dashboard.currentMonthTotalCents)}</p>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="flex items-center justify-between">
			<Card.Title>Spend by category</Card.Title>
			{#if data.dashboard.months.length > 0}
				<Select.Root type="single" value={selectedMonth ?? undefined} onValueChange={setMonth}>
					<Select.Trigger class="w-[160px]">
						{selectedMonth ? monthLabel(selectedMonth) : 'Select month'}
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
			{#if data.dashboard.categoryBreakdown.length > 0}
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
</div>
