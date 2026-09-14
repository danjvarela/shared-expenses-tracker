<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { ArrowLeft } from '@lucide/svelte';
	import { GROUP_ICONS, ICON_NAMES } from '$lib/group-icons';

	function groupIcon(iconName: string | null) {
		return iconName && (ICON_NAMES as ReadonlyArray<string>).includes(iconName)
			? GROUP_ICONS[iconName as (typeof ICON_NAMES)[number]]
			: null;
	}
	import { resolve } from '$app/paths';
	import { formatAmountCents } from '$lib/currency';
	import { getInitials, avatarUrlFor } from '$lib/avatar';
	import { toast } from 'svelte-sonner';
	import LoadingButton from '$lib/components/loading-button.svelte';
	import { useFormPending } from '$lib/forms/pending-enhance.svelte';

	const { data } = $props();
	const settleForm = useFormPending();

	let openDebtKey: string | null = $state(null);
	let amountInput = $state('');
	let error = $state<string | null>(null);

	function debtKey(debt: (typeof data.debts)[number]) {
		return `${debt.groupId}:${debt.counterpartyId}`;
	}

	function openDialog(debt: (typeof data.debts)[number]) {
		openDebtKey = debtKey(debt);
		amountInput = (debt.amountCents / 100).toFixed(2);
		error = null;
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href={resolve('/')} class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">Settle up</h1>

	{#if data.debts.length}
		<div class="flex flex-col gap-3">
			{#each data.debts as debt (debtKey(debt))}
				{@const Icon = groupIcon(debt.groupAvatarIcon)}
				<Card.Root>
					<Card.Header>
						<div class="flex items-center gap-3">
							<Avatar.Root>
								{#if debt.counterpartyAvatarStorageKey}
									<Avatar.Image
										src={avatarUrlFor(debt.counterpartyId)}
										alt={debt.counterpartyName}
									/>
								{/if}
								<Avatar.Fallback>{getInitials(debt.counterpartyName)}</Avatar.Fallback>
							</Avatar.Root>
							<div>
								<Card.Title>{debt.counterpartyName}</Card.Title>
								<Card.Description>
									<a
										href={resolve('/(app)/groups/[id]', { id: debt.groupId })}
										class="inline-flex items-center gap-1 hover:underline"
									>
										{#if Icon}<Icon class="size-3" />{/if}
										{debt.groupName}
									</a>
								</Card.Description>
							</div>
						</div>
						<Card.Action class="flex items-center gap-2 text-lg font-semibold text-red-600">
							{formatAmountCents(debt.amountCents, debt.groupCurrencyCode)}
						</Card.Action>
					</Card.Header>
					<Card.Content>
						<Button onclick={() => openDialog(debt)}>Settle</Button>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else}
		<Empty.Root>
			<Empty.Header>
				<Empty.Title>All settled up</Empty.Title>
				<Empty.Description>You don't owe anyone anything right now.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</div>

<Dialog.Root
	open={openDebtKey !== null}
	onOpenChange={(isOpen) => {
		if (!isOpen) openDebtKey = null;
	}}
>
	<Dialog.Content>
		{#each data.debts as debt (debtKey(debt))}
			{#if debtKey(debt) === openDebtKey}
				<Dialog.Header>
					<Dialog.Title>Settle with {debt.counterpartyName}</Dialog.Title>
					<Dialog.Description>
						{debt.groupName} · you owe {formatAmountCents(debt.amountCents, debt.groupCurrencyCode)}
					</Dialog.Description>
				</Dialog.Header>
				<form
					method="POST"
					class="flex flex-col gap-4"
					use:settleForm.enhance={() => {
						error = null;
						return async ({ result, update }) => {
							if (result.type === 'failure') {
								error = (result.data?.error as string) ?? 'Could not settle';
								return;
							}

							await update();

							if (result.type === 'success') {
								toast.success('Settlement recorded');
								openDebtKey = null;
							}
						};
					}}
				>
					<input type="hidden" name="groupId" value={debt.groupId} />
					<input type="hidden" name="toUserId" value={debt.counterpartyId} />

					<Field.Field>
						<Field.FieldLabel for="amount">Amount</Field.FieldLabel>
						<Input
							id="amount"
							type="number"
							min="0.01"
							max={debt.amountCents / 100}
							step="0.01"
							bind:value={amountInput}
						/>
					</Field.Field>

					<input
						type="hidden"
						name="amountCents"
						value={Math.round(Number(amountInput || '0') * 100)}
					/>

					{#if error}
						<Field.FieldError>{error}</Field.FieldError>
					{/if}

					<LoadingButton type="submit" pending={settleForm.pending}>
						Confirm settlement
					</LoadingButton>
				</form>
			{/if}
		{/each}
	</Dialog.Content>
</Dialog.Root>
