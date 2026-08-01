<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<div class="flex flex-col gap-4">
	<h1 class="text-2xl font-semibold">Your account</h1>

	{#if data.user}
		<Card.Root class="max-w-sm">
			<Card.Header>
				<Card.Title>{data.user.displayName}</Card.Title>
				<Card.Description>{data.user.email}</Card.Description>
			</Card.Header>
		</Card.Root>
	{/if}
</div>
