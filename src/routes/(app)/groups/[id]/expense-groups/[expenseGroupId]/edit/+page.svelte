<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { ArrowLeft, ChevronDown, Plus, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import LoadingButton from '$lib/components/loading-button.svelte';

	const { data } = $props();

	const NO_CATEGORY = 'none';

	type EditLine = {
		id: string | null;
		description: string;
		amountDecimal: string;
		categoryId: string;
		date: string;
		percents: Record<string, string>;
	};

	function centsToAmountString(amountCents: number) {
		return (amountCents / 100).toFixed(2);
	}

	function dateToInputValue(date: Date | string) {
		return new Date(date).toISOString().slice(0, 10);
	}

	const unlockedExpenses = $derived(data.expenses.filter((expense) => !expense.locked));
	const lockedExpenses = $derived(data.expenses.filter((expense) => expense.locked));

	function percentsFromSplits(expense: (typeof unlockedExpenses)[number]): Record<string, string> {
		return Object.fromEntries(
			expense.splits.map((split) => [
				split.userId,
				((split.amountCents / expense.amountCents) * 100).toFixed(2)
			])
		);
	}

	function lineFromExpense(expense: (typeof unlockedExpenses)[number]): EditLine {
		return {
			id: expense.id,
			description: expense.description,
			amountDecimal: centsToAmountString(expense.amountCents),
			categoryId: expense.categoryId ?? NO_CATEGORY,
			date: dateToInputValue(expense.date),
			percents: percentsFromSplits(expense)
		};
	}

	function blankLine(): EditLine {
		return {
			id: null,
			description: '',
			amountDecimal: '0',
			categoryId: NO_CATEGORY,
			date: untrack(() => lines[0]?.date ?? dateToInputValue(new Date())),
			percents: {}
		};
	}

	let name = $state(untrack(() => data.expenseGroupName ?? ''));
	let paidByUserId = $state(
		untrack(() => unlockedExpenses[0]?.paidByUserId ?? data.members[0]?.userId ?? '')
	);
	let draftDate = $state(untrack(() => dateToInputValue(unlockedExpenses[0]?.date ?? new Date())));
	let lines = $state<EditLine[]>(untrack(() => unlockedExpenses.map(lineFromExpense)));
	let saving = $state(false);

	function memberName(userId: string) {
		return data.members.find((member) => member.userId === userId)?.displayName ?? userId;
	}

	function paidByLabel() {
		return paidByUserId ? memberName(paidByUserId) : 'Select payer';
	}

	function categoryLabel(categoryId: string) {
		if (categoryId === NO_CATEGORY) return 'None';
		return data.categories.find((category) => category.id === categoryId)?.name ?? 'None';
	}

	function setLinePercent(line: EditLine, userId: string, value: string) {
		line.percents = { ...line.percents, [userId]: value };
	}

	function addLine() {
		lines = [...lines, blankLine()];
	}

	function removeLine(index: number) {
		if (lines.length <= 1) return;
		lines = lines.filter((_, i) => i !== index);
	}

	async function save() {
		if (saving || lines.length === 0) return;
		saving = true;
		try {
			const response = await fetch(
				`/groups/${data.group.id}/expense-groups/${data.expenses[0].expenseGroupId}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						paidByUserId,
						name: name.trim() || null,
						lines: lines.map((line) => ({
							id: line.id,
							description: line.description,
							amountDecimal: line.amountDecimal,
							categoryId: line.categoryId === NO_CATEGORY ? null : line.categoryId,
							date: draftDate,
							percents: line.percents
						}))
					})
				}
			);

			if (!response.ok) {
				const message = await response.text();
				toast.error(message || 'Could not save the changes');
				return;
			}

			toast.success('Expenses updated');
			await goto(resolve(`/groups/${data.group.id}`));
		} catch {
			toast.error('Could not save the changes');
		} finally {
			saving = false;
		}
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href="/groups/{data.group.id}" class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">Edit line items</h1>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<Field.Field>
				<Field.FieldLabel for="name">Name</Field.FieldLabel>
				<Input id="name" bind:value={name} placeholder="Scanned receipt" aria-label="Name" />
			</Field.Field>

			<Field.Field>
				<Field.FieldLabel for="paidByUserId">Paid by</Field.FieldLabel>
				<Select.Root type="single" bind:value={paidByUserId}>
					<Select.Trigger id="paidByUserId">{paidByLabel()}</Select.Trigger>
					<Select.Content>
						{#each data.members as member (member.userId)}
							<Select.Item value={member.userId}>{member.displayName}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</Field.Field>

			<Field.Field>
				<Field.FieldLabel for="draftDate">Date</Field.FieldLabel>
				<Input id="draftDate" type="date" bind:value={draftDate} aria-label="Date" />
			</Field.Field>

			<div class="flex flex-col gap-4">
				{#each lines as line, i (line.id ?? `new-${i}`)}
					<div class="rounded-lg border p-3">
						<div class="flex flex-col gap-2">
							<div class="flex items-center gap-2">
								<Input
									bind:value={line.description}
									placeholder="Description"
									aria-label="Line description"
								/>
								<Button
									variant="ghost"
									size="icon"
									class="shrink-0 text-muted-foreground hover:text-destructive"
									aria-label="Remove line"
									disabled={lines.length <= 1}
									onclick={() => removeLine(i)}
								>
									<Trash2 class="size-4" />
								</Button>
							</div>
							<Input
								bind:value={line.amountDecimal}
								type="number"
								step="0.01"
								min="0"
								placeholder={data.group.currencyCode}
								aria-label="Line amount"
							/>
							<Select.Root type="single" bind:value={line.categoryId}>
								<Select.Trigger aria-label="Line category">
									{categoryLabel(line.categoryId)}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value={NO_CATEGORY}>None</Select.Item>
									{#each data.categories as category (category.id)}
										<Select.Item value={category.id}>
											{category.icon}
											{category.name}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<Collapsible.Root class="mt-2">
							<Collapsible.Trigger
								class="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
							>
								<ChevronDown class="size-3.5" />
								Custom split
							</Collapsible.Trigger>
							<Collapsible.Content class="flex flex-col gap-1 pt-2">
								{#each data.members as member (member.userId)}
									<div class="flex items-center gap-2">
										<Label for={`percent-${i}-${member.userId}`} class="w-28 shrink-0 text-xs">
											{member.displayName}
										</Label>
										<Input
											id={`percent-${i}-${member.userId}`}
											type="number"
											step="0.01"
											min="0"
											max="100"
											placeholder="%"
											value={line.percents[member.userId] ?? ''}
											oninput={(e) => setLinePercent(line, member.userId, e.currentTarget.value)}
										/>
									</div>
								{/each}
							</Collapsible.Content>
						</Collapsible.Root>
					</div>
				{/each}
			</div>

			<Button variant="outline" class="self-start" onclick={addLine}>
				<Plus class="size-4" />
				Add line
			</Button>

			{#if lockedExpenses.length > 0}
				<Alert.Root>
					<Alert.Title>Some line items can't be batch-edited here</Alert.Title>
					<Alert.Description>
						{lockedExpenses.length} line item(s) involve a former group member and are edited individually:
						{#each lockedExpenses as expense, i (expense.id)}
							{#if i > 0},
							{/if}<a
								class="underline"
								href={resolve(`/groups/${data.group.id}/expenses/${expense.id}/edit`)}
								>{expense.description}</a
							>
						{/each}
					</Alert.Description>
				</Alert.Root>
			{/if}

			<div class="flex gap-2">
				<LoadingButton onclick={save} pending={saving} disabled={lines.length === 0}>
					{saving ? 'Saving…' : 'Save changes'}
				</LoadingButton>
				<Button variant="outline" href="/groups/{data.group.id}" disabled={saving}>Cancel</Button>
			</div>
		</Card.Content>
	</Card.Root>
</div>
