<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { ArrowLeft } from '@lucide/svelte';

	const { data, form } = $props();
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href="/groups/{data.group.id}" class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">{data.group.name} settings</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>Default split percentages</Card.Title>
			<Card.Description>
				Prefills new expense splits. Leave a member blank to fall back to an equal split; any
				percentages you do set must sum to 100.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" class="flex flex-col gap-4">
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
