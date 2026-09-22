<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { resolve } from '$app/paths';
	import { formatAmountCents } from '$lib/currency';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	const { data } = $props();

	function formatBalance(netBalanceCents: number, currencyCode: string) {
		const amount = formatAmountCents(Math.abs(netBalanceCents), currencyCode);
		if (netBalanceCents > 0) return { text: `You're owed ${amount}`, class: 'text-green-600' };
		if (netBalanceCents < 0) return { text: `You owe ${amount}`, class: 'text-red-600' };
		return { text: 'Settled up', class: 'text-muted-foreground' };
	}

	function formatPlainAmount(amountCents: number) {
		return new Intl.NumberFormat(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amountCents / 100);
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
</script>

<div class="container mx-auto max-w-xl p-4">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-semibold">Your groups</h1>
		<Button href="/groups/new">Create group</Button>
	</div>

	<div class="mb-4 flex flex-col gap-4">
		<Card.Root>
			<Card.Header>
				<Card.Title>This month</Card.Title>
			</Card.Header>
			<Card.Content>
				<p class="text-2xl font-semibold">
					{formatPlainAmount(data.dashboard.currentMonthTotalCents)}
				</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex items-center justify-between">
				<Card.Title>Spend by group</Card.Title>
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
				{#if data.dashboard.groupBreakdown.length > 0}
					<div class="flex flex-col gap-2">
						{#each data.dashboard.groupBreakdown as entry (entry.groupId)}
							<div class="flex items-center justify-between">
								<span>{entry.groupName}</span>
								<span class="font-medium">
									{formatAmountCents(entry.amountCents, entry.currencyCode)}
								</span>
							</div>
						{/each}
					</div>
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
				<p class="text-2xl font-semibold">
					{formatPlainAmount(data.dashboard.averagePerMonthCents)}
				</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Average per day</Card.Title>
			</Card.Header>
			<Card.Content>
				<p class="text-2xl font-semibold">
					{formatPlainAmount(data.dashboard.averagePerDayCents)}
				</p>
			</Card.Content>
		</Card.Root>
	</div>

	{#if data.hasOutstandingDebt}
		<Alert.Root class="mb-4">
			<Alert.Title>You have pending balances</Alert.Title>
			<Alert.Action class="top-1/2 -translate-y-1/2">
				<Button size="sm" href="/settle">Settle up</Button>
			</Alert.Action>
		</Alert.Root>
	{/if}

	{#if data.userGroupBalances.length}
		<div class="flex flex-col gap-3">
			{#each data.userGroupBalances as group (group.id)}
				<a
					href={resolve('/(app)/groups/[id]', { id: group.id })}
					class="block no-underline"
				>
					<Card.Root class="transition-colors hover:bg-muted/50">
						<Card.Header>
							<Card.Title>{group.name}</Card.Title>
							<Card.Description class={formatBalance(group.netCents, group.currencyCode).class}>
								{formatBalance(group.netCents, group.currencyCode).text}
							</Card.Description>
						</Card.Header>
					</Card.Root>
				</a>
			{/each}
		</div>
	{:else}
		<Empty.Root>
			<Empty.Header>
				<Empty.Title>No groups yet</Empty.Title>
				<Empty.Description>
					You have no groups yet. Get started by joining a group or creating one yourself.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<div class="flex gap-2">
					<Button variant="outline">Join group</Button>
					<Button href="/groups/new">Create group</Button>
				</div>
			</Empty.Content>
		</Empty.Root>
	{/if}
</div>
