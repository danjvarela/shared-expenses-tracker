<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import IconPicker from '$lib/components/icon-picker.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { CURRENCIES } from '$lib/currency';

	const { data, form } = $props();

	let avatarIcon: string | null = $state(data.group.avatarIcon);
	let currencyCode = $state(data.group.currencyCode);

	function currencyLabel() {
		const currency = CURRENCIES.find((c) => c.code === currencyCode);
		return currency ? `${currency.code} — ${currency.name}` : currencyCode;
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href="/groups/{data.group.id}" class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">{data.group.name} settings</h1>

	<Card.Root class="mb-4">
		<Card.Header>
			<Card.Title>Group details</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/details" class="flex flex-col gap-4">
				<Field.Field>
					<Field.FieldLabel for="name">Name</Field.FieldLabel>
					<Input id="name" name="name" required value={data.group.name} />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="currencyCode">Currency</Field.FieldLabel>
					<Select.Root type="single" name="currencyCode" bind:value={currencyCode}>
						<Select.Trigger id="currencyCode">{currencyLabel()}</Select.Trigger>
						<Select.Content>
							{#each CURRENCIES as currency (currency.code)}
								<Select.Item value={currency.code}>{currency.code} — {currency.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel>Icon</Field.FieldLabel>
					<IconPicker name="avatarIcon" bind:value={avatarIcon} />
				</Field.Field>

				{#if form?.error}
					<Field.FieldError>{form.error}</Field.FieldError>
				{/if}

				<Button type="submit">Save details</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Default split percentages</Card.Title>
			<Card.Description>
				Prefills new expense splits. Leave a member blank to fall back to an equal split; any
				percentages you do set must sum to 100.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/percents" class="flex flex-col gap-4">
				{#each data.members as member (member.userId)}
					<Field.Field>
						<Field.FieldLabel for={`percent-${member.userId}`}>
							{member.displayName}
						</Field.FieldLabel>
						<Input
							id={`percent-${member.userId}`}
							name={`percent-${member.userId}`}
							type="number"
							min="0"
							max="100"
							step="0.01"
							placeholder="Equal split"
							value={member.defaultSplitPercent ?? ''}
						/>
					</Field.Field>
				{/each}

				{#if form?.error}
					<Field.FieldError>{form.error}</Field.FieldError>
				{/if}

				<Button type="submit">Save</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
