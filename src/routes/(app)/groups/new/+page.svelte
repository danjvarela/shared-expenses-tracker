<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import IconPicker from '$lib/components/icon-picker.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { CURRENCIES, DEFAULT_CURRENCY_CODE } from '$lib/currency';

	const { form } = $props();

	let avatarIcon: string | null = $state(null);
	let currencyCode = $state(DEFAULT_CURRENCY_CODE);

	function currencyLabel() {
		const currency = CURRENCIES.find((c) => c.code === currencyCode);
		return currency ? `${currency.code} — ${currency.name}` : currencyCode;
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href="/" class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">Create group</h1>

	<Card.Root>
		<Card.Content>
			<form method="POST" action="?/create" class="flex flex-col gap-4">
				<Field.Field>
					<Field.FieldLabel for="name">Name</Field.FieldLabel>
					<Input id="name" name="name" required />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="description">Description</Field.FieldLabel>
					<Input id="description" name="description" />
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

				<Button type="submit">Create group</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
