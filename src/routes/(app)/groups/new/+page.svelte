<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import Combobox from '$lib/components/combobox.svelte';
	import IconPicker from '$lib/components/icon-picker.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { CURRENCIES, DEFAULT_CURRENCY_CODE } from '$lib/currency';

	const { form } = $props();

	let avatarIcon: string | null = $state(null);
	let currencyCode = $state(DEFAULT_CURRENCY_CODE);

	const currencyOptions = CURRENCIES.map((currency) => ({
		value: currency.code,
		label: `${currency.code} — ${currency.name}`,
		triggerLabel: currency.code
	}));
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
					<Field.FieldLabel for="currencyCode">Currency</Field.FieldLabel>
					<Combobox
						id="currencyCode"
						name="currencyCode"
						options={currencyOptions}
						bind:value={currencyCode}
						searchPlaceholder="Search currencies..."
					/>
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
