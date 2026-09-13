<script lang="ts">
	import { ArrowLeft, CircleCheck } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';

	const { data, form } = $props();

	type UpdateProfileForm = { source?: string; message?: string; success?: boolean };
	const updateProfileForm = $derived(form as UpdateProfileForm | null);

	let saved = $state(false);
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href={resolve('/')} class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">Account settings</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>Profile</Card.Title>
			<Card.Description>The name others see when you share expenses.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateProfile"
				class="flex flex-col gap-4"
				use:enhance={() => {
					saved = false;
					return async ({ result, update }) => {
						await update({ reset: false });
						saved = result.type === 'success';
						if (saved) toast.success('Display name updated');
					};
				}}
			>
				<Field.Field>
					<Field.FieldLabel for="displayName">Display name</Field.FieldLabel>
					<Input
						id="displayName"
						name="displayName"
						required
						maxlength={50}
						autocomplete="name"
						value={data.displayName}
					/>
				</Field.Field>

				{#if updateProfileForm?.source === 'updateProfile' && updateProfileForm?.message}
					<Field.FieldError>{updateProfileForm.message}</Field.FieldError>
				{/if}

				{#if saved}
					<Alert.Root>
						<CircleCheck class="size-4" />
						<Alert.Title>Display name updated</Alert.Title>
					</Alert.Root>
				{/if}

				<Button type="submit">Save</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
