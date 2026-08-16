<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ArrowLeft } from '@lucide/svelte';
	import { formatAmountCents } from '$lib/currency';

	const { data } = $props();

	function formatAmount(amountCents: number) {
		return formatAmountCents(amountCents, data.group.currencyCode);
	}

	function formatDate(date: Date) {
		return new Date(date).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href="/groups/{data.group.id}" class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>

	<h1 class="mb-4 text-2xl font-semibold">Settlement</h1>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">Amount</span>
				<span class="text-lg font-semibold">{formatAmount(data.settlement.amountCents)}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">From</span>
				<span>{data.settlement.fromUserName}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">To</span>
				<span>{data.settlement.toUserName}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">Group</span>
				<span>{data.group.name}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">Date</span>
				<span>{formatDate(data.settlement.createdAt)}</span>
			</div>
		</Card.Content>
	</Card.Root>
</div>
