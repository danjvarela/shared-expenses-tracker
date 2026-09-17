<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { Plus, Trash2, FileText, ExternalLink } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { ExpenseReceipt } from '$lib/server/domain/expense-receipt';

	let {
		groupId,
		expenseId,
		receipts,
		isDemo = false
	}: { groupId: string; expenseId: string; receipts: Array<ExpenseReceipt>; isDemo?: boolean } =
		$props();

	// svelte-ignore state_referenced_locally
	let localReceipts = $state(receipts);
	let fileInput: HTMLInputElement | undefined = $state();
	let selected = $state<ExpenseReceipt | null>(null);
	let pendingDelete = $state<ExpenseReceipt | null>(null);

	function readUrl(receiptId: string) {
		return `/groups/${groupId}/expenses/${expenseId}/receipts/${receiptId}`;
	}

	function isPdf(receipt: ExpenseReceipt) {
		return receipt.mime === 'application/pdf';
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

	async function confirmDelete() {
		if (!pendingDelete) return;
		const target = pendingDelete;
		pendingDelete = null;

		const response = await fetch(readUrl(target.id), { method: 'DELETE' });

		if (response.ok) {
			localReceipts = localReceipts.filter((r) => r.id !== target.id);
			if (selected?.id === target.id) selected = null;
			toast.success('Receipt deleted');
		} else {
			const message = await response.text();
			toast.error(message || 'Could not delete the receipt');
		}
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
			accept="image/*,application/pdf"
			class="hidden"
			onchange={onFileChosen}
		/>
	</div>

	{#if localReceipts.length === 0}
		<p class="text-sm text-muted-foreground">No receipts yet.</p>
	{:else}
		<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
			{#each localReceipts as receipt (receipt.id)}
				<div class="group relative aspect-square overflow-hidden rounded">
					<Button variant="ghost" class="h-full w-full p-0" onclick={() => (selected = receipt)}>
						{#if isPdf(receipt)}
							<div
								class="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground"
							>
								<FileText class="size-8" />
								<span class="max-w-full truncate px-2 text-xs">PDF</span>
							</div>
						{:else}
							<img
								src={readUrl(receipt.id)}
								alt={receipt.originalFilename ?? 'Receipt'}
								loading="lazy"
								class="h-full w-full object-cover"
							/>
						{/if}
					</Button>
					{#if isDemo}
						<Tooltip.Provider>
							<Tooltip.Root>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<span {...props} class="absolute top-1 right-1 block size-7">
											<Button
												variant="destructive"
												size="icon"
												class="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
												aria-label="Delete receipt"
												disabled
											>
												<Trash2 class="size-4" />
											</Button>
										</span>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content>Disabled in the demo environment</Tooltip.Content>
							</Tooltip.Root>
						</Tooltip.Provider>
					{:else}
						<Button
							variant="destructive"
							size="icon"
							class="absolute top-1 right-1 size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
							aria-label="Delete receipt"
							onclick={() => (pendingDelete = receipt)}
						>
							<Trash2 class="size-4" />
						</Button>
					{/if}
				</div>
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
			{#if isPdf(selected)}
				<object
					data={readUrl(selected.id)}
					type="application/pdf"
					class="h-[80vh] w-full"
					aria-label={selected.originalFilename ?? 'Receipt'}
				>
					<div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
						<p class="text-sm">This PDF can't be shown inline.</p>
						<Button
							href={readUrl(selected.id)}
							target="_blank"
							rel="noopener noreferrer"
							variant="outline"
						>
							<ExternalLink class="size-4" />
							Open in new tab
						</Button>
					</div>
				</object>
			{:else}
				<a
					href={readUrl(selected.id)}
					target="_blank"
					rel="noopener noreferrer"
					class="block"
					aria-label="Open receipt image in new tab"
				>
					<img
						src={readUrl(selected.id)}
						alt={selected.originalFilename ?? 'Receipt'}
						loading="lazy"
						class="mx-auto max-h-[80vh] w-auto object-contain"
					/>
				</a>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root
	bind:open={
		() => pendingDelete !== null, (value) => (pendingDelete = value ? pendingDelete : null)
	}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this receipt?</AlertDialog.Title>
			<AlertDialog.Description>
				This will permanently delete "{pendingDelete?.originalFilename ?? 'this receipt'}" and
				cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={confirmDelete}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
