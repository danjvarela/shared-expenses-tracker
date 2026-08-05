<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { ArrowLeft } from '@lucide/svelte';
	import { untrack } from 'svelte';

	const { data, form } = $props();

	const today = new Date().toISOString().slice(0, 10);

	const NO_CATEGORY = 'none';

	let paidByUserId = $state(untrack(() => data.user?.id ?? data.members[0]?.userId ?? ''));
	let categoryId = $state(NO_CATEGORY);
	let splitMethod: 'equal' | 'percentage' | 'exact' = $state('equal');

	let included = $state(
		untrack(() => Object.fromEntries(data.members.map((member) => [member.userId, true])))
	);
	let percents = $state(
		untrack(() =>
			Object.fromEntries(
				data.members.map((member) => [member.userId, member.defaultSplitPercent ?? ''])
			)
		)
	);

	function memberName(userId: string) {
		return data.members.find((member) => member.userId === userId)?.displayName ?? userId;
	}

	function paidByLabel() {
		return paidByUserId ? memberName(paidByUserId) : 'Select payer';
	}

	function categoryLabel() {
		if (categoryId === NO_CATEGORY) return 'None';
		return data.categories.find((category) => category.id === categoryId)?.name ?? 'None';
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href="/groups/{data.group.id}" class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">Add expense</h1>

	<Card.Root>
		<Card.Content>
			<form method="POST" class="flex flex-col gap-4">
				<Field.Field>
					<Field.FieldLabel for="description">Description</Field.FieldLabel>
					<Input id="description" name="description" required />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="amount">Amount ({data.group.currencyCode})</Field.FieldLabel>
					<Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="date">Date</Field.FieldLabel>
					<Input id="date" name="date" type="date" value={today} required />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="paidByUserId">Paid by</Field.FieldLabel>
					<Select.Root type="single" name="paidByUserId" bind:value={paidByUserId}>
						<Select.Trigger id="paidByUserId">{paidByLabel()}</Select.Trigger>
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

				<Field.Field>
					<Field.FieldLabel>Split method</Field.FieldLabel>
					<RadioGroup.Root name="splitMethod" bind:value={splitMethod}>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="equal" id="method-equal" />
							<Label for="method-equal">Equal</Label>
						</div>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="percentage" id="method-percentage" />
							<Label for="method-percentage">Percentage</Label>
						</div>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="exact" id="method-exact" />
							<Label for="method-exact">Exact amounts</Label>
						</div>
					</RadioGroup.Root>
				</Field.Field>

				<Field.FieldSet>
					<Field.FieldLegend>Split between</Field.FieldLegend>
					{#each data.members as member (member.userId)}
						<div class="flex items-center gap-3">
							<Checkbox
								id={`included-${member.userId}`}
								name={`included-${member.userId}`}
								bind:checked={included[member.userId]}
							/>
							<Label for={`included-${member.userId}`} class="w-32 shrink-0">
								{member.displayName}
							</Label>

							{#if splitMethod === 'percentage'}
								<Input
									name={`percent-${member.userId}`}
									type="number"
									step="0.01"
									min="0"
									max="100"
									placeholder="%"
									disabled={!included[member.userId]}
									bind:value={percents[member.userId]}
								/>
							{:else if splitMethod === 'exact'}
								<Input
									name={`exact-${member.userId}`}
									type="number"
									step="0.01"
									min="0"
									placeholder={data.group.currencyCode}
									disabled={!included[member.userId]}
								/>
							{/if}
						</div>
					{/each}
				</Field.FieldSet>

				{#if form?.error}
					<Field.FieldError>{form.error}</Field.FieldError>
				{/if}

				<div class="flex gap-2">
					<Button type="submit" formaction="?/create">Add expense</Button>
					<Button type="submit" formaction="?/createAndAddAnother" variant="outline">
						Save and add another
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
