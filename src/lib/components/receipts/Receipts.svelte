<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Plus } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { ExpenseReceipt } from '$lib/server/domain/expense-receipt';

	let {
		groupId,
		expenseId,
		receipts
	}: { groupId: string; expenseId: string; receipts: Array<ExpenseReceipt> } = $props();

	// svelte-ignore state_referenced_locally
	let localReceipts = $state(receipts);
	let fileInput: HTMLInputElement | undefined = $state();
	let selected = $state<ExpenseReceipt | null>(null);

	function readUrl(receiptId: string) {
		return `/groups/${groupId}/expenses/${expenseId}/receipts/${receiptId}`;
	}

	async function onFileChosen() {
		const file = fileInput?.files?.[0];
		if (!file) return;

		const formData = new FormData();
		formData.append('file', file);

		const response = await fetch(`/groups/${groupId}/expenses/${expenseId}/receipts`, {
			method: 'POST',
			body: formData
		});

		if (response.ok) {
			const receipt: ExpenseReceipt = await response.json();
			localReceipts = [receipt, ...localReceipts];
			toast.success('Receipt added');
		} else {
			const message = await response.text();
			toast.error(message || 'Could not add the receipt');
		}

		if (fileInput) fileInput.value = '';
	}
</script>

<section class="mt-6">
	<div class="mb-2 flex items-center justify-between">
		<h2 class="text-sm font-medium text-muted-foreground">Receipts</h2>
		<Button size="sm" variant="outline" onclick={() => fileInput?.click()}>
			<Plus class="size-4" />
			Add
		</Button>
		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			class="hidden"
			onchange={onFileChosen}
		/>
	</div>

	{#if localReceipts.length === 0}
		<p class="text-sm text-muted-foreground">No receipts yet.</p>
	{:else}
		<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
			{#each localReceipts as receipt (receipt.id)}
				<Button
					variant="ghost"
					class="h-auto w-full overflow-hidden rounded p-0"
					onclick={() => (selected = receipt)}
				>
					<img
						src={readUrl(receipt.id)}
						alt={receipt.originalFilename ?? 'Receipt'}
						loading="lazy"
						class="aspect-square w-full object-cover"
					/>
				</Button>
			{/each}
		</div>
	{/if}
</section>

<Dialog.Root bind:open={() => selected !== null, (value) => (selected = value ? selected : null)}>
	<Dialog.Content class="max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>{selected?.originalFilename ?? 'Receipt'}</Dialog.Title>
		</Dialog.Header>
		{#if selected}
			<img src={readUrl(selected.id)} alt={selected.originalFilename ?? 'Receipt'} class="w-full" />
		{/if}
	</Dialog.Content>
</Dialog.Root>
