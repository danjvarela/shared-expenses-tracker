<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ArrowLeft, Pencil, Trash2 } from '@lucide/svelte';
	import { resolve } from '$app/paths';
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

	{#if form?.error}
		<Alert.Root variant="destructive" class="mb-3">
			<Alert.Title>{form.error}</Alert.Title>
		</Alert.Root>
	{/if}

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
			{#each data.groupExpenses as expense (expense.id)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{expense.description}</Card.Title>
						<Card.Description>
							Paid by {expense.paidByName} · {formatDate(expense.createdAt)}
						</Card.Description>
						<Card.Action class="flex items-center gap-2 text-lg font-semibold">
							{formatAmount(expense.amountCents)}
						</Card.Action>
					</Card.Header>
					<Card.Content class="flex items-center justify-between text-sm text-muted-foreground">
						<span>
							{#if expense.categoryName}
								{expense.categoryIcon}
								{expense.categoryName}
							{/if}
						</span>
						<div class="flex">
							<Button
								variant="ghost"
								size="icon"
								href="{data.group.id}/expenses/{expense.id}/edit"
								aria-label="Edit expense"
							>
								<Pencil class="size-4" />
							</Button>
							<AlertDialog.Root>
								<AlertDialog.Trigger>
									{#snippet child({ props })}
										<Button {...props} variant="ghost" size="icon" aria-label="Delete expense">
											<Trash2 class="size-4" />
										</Button>
									{/snippet}
								</AlertDialog.Trigger>
								<AlertDialog.Content>
									<AlertDialog.Header>
										<AlertDialog.Title>Delete this expense?</AlertDialog.Title>
										<AlertDialog.Description>
											This will permanently delete "{expense.description}" and cannot be undone.
										</AlertDialog.Description>
									</AlertDialog.Header>
									<AlertDialog.Footer>
										<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
										<form method="POST" action="?/delete" use:enhance>
											<input type="hidden" name="expenseId" value={expense.id} />
											<AlertDialog.Action type="submit">Delete</AlertDialog.Action>
										</form>
									</AlertDialog.Footer>
								</AlertDialog.Content>
							</AlertDialog.Root>
						</div>
					</Card.Content>
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
