<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ArrowLeft } from '@lucide/svelte';
	import { formatAmountCents } from '$lib/currency';
	import { enhance } from '$app/forms';

	const { data, form } = $props();

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

	function categoryLabel() {
		if (!data.expense.categoryId) return null;
		const category = data.categories.find((category) => category.id === data.expense.categoryId);
		return category ? `${category.icon} ${category.name}` : null;
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href="/groups/{data.group.id}" class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>

	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-semibold">{data.expense.description}</h1>
		<div class="flex gap-2">
			<Button variant="outline" href="/groups/{data.group.id}/expenses/{data.expense.id}/edit">
				Edit
			</Button>
			<AlertDialog.Root>
				<AlertDialog.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="destructive">Delete</Button>
					{/snippet}
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Delete this expense?</AlertDialog.Title>
						<AlertDialog.Description>
							This will permanently delete "{data.expense.description}" and cannot be undone.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
						<form method="POST" action="?/delete" use:enhance>
							<AlertDialog.Action type="submit">Delete</AlertDialog.Action>
						</form>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</div>
	</div>

	{#if form?.error}
		<Alert.Root variant="destructive" class="mb-4">
			<Alert.Title>{form.error}</Alert.Title>
		</Alert.Root>
	{/if}

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">Amount</span>
				<span class="text-lg font-semibold">{formatAmount(data.expense.amountCents)}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">Date</span>
				<span>{formatDate(data.expense.date)}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">Paid by</span>
				<span>{data.expense.paidByName}</span>
			</div>
			{#if categoryLabel()}
				<div class="flex items-center justify-between">
					<span class="text-sm text-muted-foreground">Category</span>
					<span>{categoryLabel()}</span>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<h2 class="mt-6 mb-2 text-sm font-medium text-muted-foreground">Split between</h2>
	<Card.Root>
		<Card.Content class="flex flex-col gap-3">
			{#each data.expense.splits as split (split.userId)}
				<div class="flex items-center justify-between">
					<span>{split.displayName}</span>
					<span>{formatAmount(split.amountCents)}</span>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
</div>
