<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ArrowLeft, ChevronDown } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { formatAmountCents } from '$lib/currency';
	import { groupExpensesForList } from '$lib/expense-list-grouping';

	const { data } = $props();

	function formatAmount(amountCents: number) {
		return formatAmountCents(amountCents, data.group.currencyCode);
	}

	function formatDate(date: Date) {
		return new Date(date).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const items = $derived(groupExpensesForList(data.groupExpenses));
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href={resolve('/')} class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-semibold">{data.group.name}</h1>
		<div class="flex gap-2">
			<Button variant="outline" href="{data.group.id}/settings">Settings</Button>
			{#if data.scannerEnabled}
				<Button variant="outline" href="{data.group.id}/scan">Scan receipt</Button>
			{/if}
			<Button href="{data.group.id}/expenses/new">Add expense</Button>
		</div>
	</div>

	{#if data.hasOutstandingDebt}
		<Alert.Root class="mb-4">
			<Alert.Title>You have pending balances</Alert.Title>
			<Alert.Action class="top-1/2 -translate-y-1/2">
				<Button size="sm" href="{data.group.id}/settle">Settle up</Button>
			</Alert.Action>
		</Alert.Root>
	{/if}

	{#if data.groupExpenses.length}
		<div class="flex flex-col gap-3">
			{#each items as item (item.kind === 'single' ? item.expense.id : item.expenseGroupId)}
				{#if item.kind === 'single'}
					{@const expense = item.expense}
					<a href="{data.group.id}/expenses/{expense.id}">
						<Card.Root class="transition-colors hover:bg-accent/50">
							<Card.Header>
								<Card.Title>{expense.description}</Card.Title>
								<Card.Description>
									Paid by {expense.paidByName} · {formatDate(expense.createdAt)}
								</Card.Description>
								<Card.Action class="flex items-center gap-2 text-lg font-semibold">
									{formatAmount(expense.amountCents)}
								</Card.Action>
							</Card.Header>
							<Card.Content class="text-sm text-muted-foreground">
								{#if expense.categoryName}
									{expense.categoryIcon}
									{expense.categoryName}
								{/if}
							</Card.Content>
						</Card.Root>
					</a>
				{:else}
					{@const firstChild = item.children[0]}
					<Collapsible.Root class="group">
						<Collapsible.Trigger class="w-full text-left">
							<Card.Root
								class="transition-colors group-data-[state=open]:bg-muted/40 hover:bg-accent/50"
							>
								<Card.Header>
									<Card.Title>Scanned receipt</Card.Title>
									<Card.Description>
										Paid by {firstChild.paidByName} · {formatDate(firstChild.createdAt)}
									</Card.Description>
									<Card.Action class="flex items-center gap-2 text-lg font-semibold">
										<Badge variant="secondary">{item.children.length} items</Badge>
										{formatAmount(item.totalCents)}
									</Card.Action>
								</Card.Header>
								<Card.Content
									class="flex items-center justify-between text-sm text-muted-foreground"
								>
									<span>Expand to view line items</span>
									<ChevronDown
										class="size-4 transition-transform group-data-[state=open]:rotate-180"
									/>
								</Card.Content>
							</Card.Root>
						</Collapsible.Trigger>
						<Collapsible.Content>
							<div class="mt-2 flex flex-col gap-2 border-l-2 border-muted pl-3">
								{#each item.children as child (child.id)}
									<a
										href="{data.group.id}/expenses/{child.id}"
										class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
									>
										<span class="flex flex-col">
											<span class="font-medium">{child.description}</span>
											<span class="text-muted-foreground">
												{#if child.paidByName !== firstChild.paidByName ||
													child.createdAt.valueOf() !== firstChild.createdAt.valueOf()}
													Paid by {child.paidByName} · {formatDate(child.createdAt)}{#if child.categoryName}
														· {child.categoryIcon} {child.categoryName}{/if}
												{:else if child.categoryName}
													{child.categoryIcon} {child.categoryName}
												{/if}
											</span>
										</span>
										<span class="font-semibold">
											{formatAmount(child.amountCents)}
										</span>
									</a>
								{/each}
							</div>
						</Collapsible.Content>
					</Collapsible.Root>
				{/if}
			{/each}
		</div>
	{:else}
		<Empty.Root>
			<Empty.Header>
				<Empty.Title>No expenses yet</Empty.Title>
				<Empty.Description>
					This group has no expenses yet. Get started by adding one.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button href="{data.group.id}/expenses/new">Add expense</Button>
			</Empty.Content>
		</Empty.Root>
	{/if}
</div>
