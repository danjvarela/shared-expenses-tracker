<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { Group } from '$lib/server/domain/group';

	type GroupSummary = Group & { netBalanceCents: number };
	const { data } = $props();

	// TODO: replace with real data from `data.groups` once balances are wired up
	const sampleGroups: GroupSummary[] = [
		{
			id: '1',
			name: 'Roommates',
			createdAt: new Date(),
			netBalanceCents: -2050
		},
		{
			id: '2',
			name: 'Japan Trip',
			createdAt: new Date(),
			netBalanceCents: 12500
		},
		{
			id: '3',
			name: 'Book Club',
			createdAt: new Date(),
			netBalanceCents: 0
		}
	];

	function formatBalance(netBalanceCents: number) {
		const amount = (Math.abs(netBalanceCents) / 100).toFixed(2);
		if (netBalanceCents > 0) return { text: `You're owed $${amount}`, class: 'text-green-600' };
		if (netBalanceCents < 0) return { text: `You owe $${amount}`, class: 'text-red-600' };
		return { text: 'Settled up', class: 'text-muted-foreground' };
	}
</script>

<div class="container mx-auto max-w-2xl p-4">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-semibold">Your groups</h1>
		<Button>Create group</Button>
	</div>

	{#if data.userGroupBalances.length}
		<div class="flex flex-col gap-3">
			{#each data.userGroupBalances as group (group.id)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{group.name}</Card.Title>
						<Card.Description class={formatBalance(group.netCents).class}>
							{formatBalance(group.netCents).text}
						</Card.Description>
					</Card.Header>
				</Card.Root>
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
					<Button>Create group</Button>
				</div>
			</Empty.Content>
		</Empty.Root>
	{/if}
</div>
