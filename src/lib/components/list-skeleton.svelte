<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as ScrollArea from '$lib/components/ui/scroll-area/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	let { routeId }: { routeId: string } = $props();

	let isGroupExpenses = $derived(routeId === '/(app)/groups/[id]/expenses');
	let isSettle = $derived(routeId === '/(app)/settle');
	let isNotifications = $derived(routeId === '/(app)/notifications');
</script>

{#if isGroupExpenses}
	<div class="container mx-auto flex h-[calc(100dvh-4rem)] max-w-xl flex-col p-4">
		<Skeleton class="mb-2 h-8 w-20 shrink-0" />
		<div class="mb-4 flex shrink-0 items-center justify-between">
			<Skeleton class="h-7 w-40" />
			<div class="flex gap-2">
				<Skeleton class="size-9 rounded-md" />
				<Skeleton class="size-9 rounded-md" />
			</div>
		</div>
		<div class="mb-4 flex shrink-0 flex-col gap-2">
			<div class="flex items-center gap-2">
				<Skeleton class="h-9 flex-1 rounded-md" />
				<Skeleton class="size-9 rounded-md" />
				<Skeleton class="size-9 rounded-md" />
				<Skeleton class="size-9 rounded-md" />
			</div>
		</div>
		<ScrollArea.Root class="min-h-0 flex-1">
			<div class="flex flex-col gap-6">
				<section class="flex flex-col gap-3">
					<Skeleton class="h-4 w-24" />
					{#each [...Array(5).keys()] as i (i)}
						<Card.Root>
							<Card.Header>
								<Skeleton class="h-5 w-40" />
								<Skeleton class="h-3.5 w-52" />
								<Card.Action class="flex items-center gap-2">
									<Skeleton class="h-6 w-16" />
								</Card.Action>
							</Card.Header>
							<Card.Content>
								<Skeleton class="h-3.5 w-28" />
							</Card.Content>
						</Card.Root>
					{/each}
				</section>
			</div>
		</ScrollArea.Root>
	</div>
{:else if isSettle}
	<div class="container mx-auto max-w-xl p-4">
		<Skeleton class="mb-2 h-8 w-20" />
		<Skeleton class="mb-4 h-8 w-32" />
		<div class="flex flex-col gap-3">
			{#each [...Array(4).keys()] as i (i)}
				<Card.Root>
					<Card.Header>
						<div class="flex items-center gap-3">
							<Skeleton class="size-10 rounded-full" />
							<div class="flex flex-col gap-1.5">
								<Skeleton class="h-5 w-32" />
								<Skeleton class="h-3.5 w-24" />
							</div>
						</div>
						<Card.Action class="flex items-center gap-2">
							<Skeleton class="h-6 w-16" />
						</Card.Action>
					</Card.Header>
					<Card.Content>
						<Skeleton class="h-9 w-20" />
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	</div>
{:else if isNotifications}
	<div class="container mx-auto max-w-xl p-4">
		<div class="mb-4 flex items-center justify-between">
			<Skeleton class="h-8 w-40" />
			<Skeleton class="h-8 w-20" />
		</div>
		<div class="flex flex-col gap-3">
			{#each [...Array(5).keys()] as i (i)}
				<Card.Root>
					<Card.Header>
						<Skeleton class="h-5 w-48" />
						<Skeleton class="h-3.5 w-24" />
					</Card.Header>
				</Card.Root>
			{/each}
		</div>
	</div>
{/if}
