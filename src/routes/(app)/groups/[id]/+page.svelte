<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ArrowLeft } from '@lucide/svelte';
	import { resolve } from '$app/paths';

	const { data } = $props();

	function formatAmount(amountCents: number) {
		return `₱${(amountCents / 100).toFixed(2)}`;
	}

	function formatDate(date: Date) {
		return new Date(date).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
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
			<Button href="{data.group.id}/expenses/new">Add expense</Button>
		</div>
	</div>

	{#if data.groupExpenses.length}
		<div class="flex flex-col gap-3">
			{#each data.groupExpenses as expense (expense.id)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{expense.description}</Card.Title>
						<Card.Description>
							Paid by {expense.paidByName} · {formatDate(expense.createdAt)}
						</Card.Description>
						<Card.Action class="text-lg font-semibold">
							{formatAmount(expense.amountCents)}
						</Card.Action>
					</Card.Header>
					{#if expense.categoryName}
						<Card.Content class="text-sm text-muted-foreground">
							{expense.categoryIcon}
							{expense.categoryName}
						</Card.Content>
					{/if}
				</Card.Root>
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
