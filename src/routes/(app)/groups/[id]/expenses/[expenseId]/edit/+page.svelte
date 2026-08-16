<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { ArrowLeft, Info, Lock } from '@lucide/svelte';
	import { untrack } from 'svelte';

	const { data, form } = $props();

	const NO_CATEGORY = 'none';

	function splitFor(userId: string) {
		return data.expense.splits.find((split) => split.userId === userId);
	}

	function centsToAmountString(amountCents: number) {
		return (amountCents / 100).toFixed(2);
	}

	let paidByUserId = $state(untrack(() => data.expense.paidByUserId));
	let categoryId = $state(untrack(() => data.expense.categoryId ?? NO_CATEGORY));

	let included = $state(
		untrack(() =>
			Object.fromEntries(
				data.members.map((member) => [member.userId, Boolean(splitFor(member.userId))])
			)
		)
	);

	function memberName(userId: string) {
		return data.members.find((member) => member.userId === userId)?.displayName;
	}

	function paidByLabel() {
		if (!paidByUserId) return 'Select payer';
		return memberName(paidByUserId) ?? data.expense.paidByName;
	}

	function isCurrentMember(userId: string) {
		return data.members.some((member) => member.userId === userId);
	}

	function categoryLabel() {
		if (categoryId === NO_CATEGORY) return 'None';
		return data.categories.find((category) => category.id === categoryId)?.name ?? 'None';
	}

	const formerMemberSplits = $derived(
		data.expense.splits.filter((split) => !isCurrentMember(split.userId))
	);
	const paidByIsFormerMember = $derived(!isCurrentMember(data.expense.paidByUserId));
	const involvesFormerMember = $derived(formerMemberSplits.length > 0 || paidByIsFormerMember);
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href="/groups/{data.group.id}" class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">Edit expense</h1>

	<Card.Root>
		<Card.Content>
			<form method="POST" action="?/update" class="flex flex-col gap-4">
				<input type="hidden" name="splitMethod" value="exact" />

				<Field.Field>
					<Field.FieldLabel for="description">Description</Field.FieldLabel>
					<Input id="description" name="description" value={data.expense.description} required />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="amount">Amount ({data.group.currencyCode})</Field.FieldLabel>
					{#if paidByIsFormerMember}
						<input
							type="hidden"
							name="amount"
							value={centsToAmountString(data.expense.amountCents)}
						/>
						<Input
							id="amount"
							type="number"
							step="0.01"
							value={centsToAmountString(data.expense.amountCents)}
							disabled
						/>
					{:else}
						<Input
							id="amount"
							name="amount"
							type="number"
							step="0.01"
							min="0.01"
							value={centsToAmountString(data.expense.amountCents)}
							required
						/>
					{/if}
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="date">Date</Field.FieldLabel>
					<Input
						id="date"
						name="date"
						type="date"
						value={new Date(data.expense.date).toISOString().slice(0, 10)}
						required
					/>
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="paidByUserId">Paid by</Field.FieldLabel>
					<input type="hidden" name="paidByUserId" value={paidByUserId} />
					<Select.Root type="single" bind:value={paidByUserId} disabled={involvesFormerMember}>
						<Select.Trigger id="paidByUserId">
							{paidByLabel()}
							{#if involvesFormerMember}
								<Lock class="ml-auto size-4 text-muted-foreground" />
							{/if}
						</Select.Trigger>
						<Select.Content>
							{#each data.members as member (member.userId)}
								<Select.Item value={member.userId}>{member.displayName}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="categoryId">Category</Field.FieldLabel>
					<Select.Root type="single" name="categoryId" bind:value={categoryId}>
						<Select.Trigger id="categoryId">{categoryLabel()}</Select.Trigger>
						<Select.Content>
							<Select.Item value={NO_CATEGORY}>None</Select.Item>
							{#each data.categories as category (category.id)}
								<Select.Item value={category.id}>{category.icon} {category.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>

				<Field.FieldSet>
					<Field.FieldLegend>Split between</Field.FieldLegend>
					{#if involvesFormerMember}
						<p class="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
							<Info class="mt-0.5 size-4 shrink-0" />
							<span>
								This expense cannot be fully edited because it involves a former member of the
								group. Their share is carried through unchanged.
							</span>
						</p>
					{/if}
					{#each data.members as member (member.userId)}
						{@const existingSplit = splitFor(member.userId)}
						<div class="flex items-center gap-3">
							<Checkbox
								id={`included-${member.userId}`}
								name={`included-${member.userId}`}
								bind:checked={included[member.userId]}
								disabled={paidByIsFormerMember}
							/>
							<Label for={`included-${member.userId}`} class="w-32 shrink-0">
								{member.displayName}
							</Label>
							<Input
								name={`exact-${member.userId}`}
								type="number"
								step="0.01"
								min="0"
								placeholder={data.group.currencyCode}
								disabled={paidByIsFormerMember || !included[member.userId]}
								value={existingSplit ? centsToAmountString(existingSplit.amountCents) : ''}
							/>
						</div>
					{/each}
					{#each data.expense.splits as split (split.userId)}
						{#if !isCurrentMember(split.userId)}
							<div class="flex items-center gap-3">
								<div class="size-4 shrink-0"></div>
								<Label class="w-32 shrink-0 text-muted-foreground">{split.displayName}</Label>
								<Input
									type="number"
									step="0.01"
									disabled
									value={centsToAmountString(split.amountCents)}
								/>
							</div>
						{/if}
					{/each}
				</Field.FieldSet>

				{#if form?.error}
					<Field.FieldError>{form.error}</Field.FieldError>
				{/if}

				<div class="mt-6 flex gap-2">
					<Button type="submit">Save changes</Button>
					<Button variant="outline" href="/groups/{data.group.id}">Cancel</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	{#if form?.error}
		<Alert.Root variant="destructive" class="mt-4">
			<Alert.Title>{form.error}</Alert.Title>
		</Alert.Root>
	{/if}
</div>
