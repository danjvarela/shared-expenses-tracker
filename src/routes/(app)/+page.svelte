<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { resolve } from '$app/paths';
	import { formatAmountCents } from '$lib/currency';

	const { data } = $props();

	function formatBalance(netBalanceCents: number, currencyCode: string) {
		const amount = formatAmountCents(Math.abs(netBalanceCents), currencyCode);
		if (netBalanceCents > 0) return { text: `You're owed ${amount}`, class: 'text-green-600' };
		if (netBalanceCents < 0) return { text: `You owe ${amount}`, class: 'text-red-600' };
		return { text: 'Settled up', class: 'text-muted-foreground' };
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-semibold">Your groups</h1>
		<Button href="/groups/new">Create group</Button>
	</div>

	{#if data.userGroupBalances.length}
		<div class="flex flex-col gap-3">
			{#each data.userGroupBalances as group (group.id)}
				<a href={resolve('/(app)/groups/[id]', { id: group.id })} class="block no-underline">
					<Card.Root class="transition-colors hover:bg-muted/50">
						<Card.Header>
							<Card.Title>{group.name}</Card.Title>
							<Card.Description
								class={formatBalance(group.netCents, group.currencyCode).class}
							>
								{formatBalance(group.netCents, group.currencyCode).text}
							</Card.Description>
						</Card.Header>
					</Card.Root>
				</a>
			{/each}
		</div>
	{:else}
		<Empty.Root>
			<Empty.Header>
				<Empty.Title>No groups yet</Empty.Title>
				<Empty.Description>
					You have no groups yet. Get started by joining a group or creating one yourself.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<div class="flex gap-2">
					<Button variant="outline">Join group</Button>
					<Button href="/groups/new">Create group</Button>
				</div>
			</Empty.Content>
		</Empty.Root>
	{/if}
</div>
