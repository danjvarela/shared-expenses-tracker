<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<div class="flex flex-col gap-4">
	<h1 class="text-2xl font-semibold">Your groups</h1>

	{#if data.groups.length === 0}
		<p class="text-muted-foreground">You're not part of any group yet.</p>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.groups as group (group.id)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{group.name}</Card.Title>
						<Card.Description>
							Created {new Date(group.createdAt).toLocaleDateString()}
						</Card.Description>
					</Card.Header>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
