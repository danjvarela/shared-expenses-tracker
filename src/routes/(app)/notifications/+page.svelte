<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import LoadingButton from '$lib/components/loading-button.svelte';
	import { useFormPending } from '$lib/forms/pending-enhance.svelte';
	import { LoaderCircle } from '@lucide/svelte';

	const { data } = $props();
	const readAllForm = useFormPending();
	const openForm = useFormPending();

	function formatDate(date: Date) {
		return new Date(date).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-semibold">Notifications</h1>
		{#if data.notifications.some((notification) => !notification.readAt)}
			<form method="POST" action="?/readAll" use:readAllForm.enhance>
				<LoadingButton variant="outline" size="sm" type="submit" pending={readAllForm.pending}>
					Read all
				</LoadingButton>
			</form>
		{/if}
	</div>

	{#if data.notifications.length}
		<div class="flex flex-col gap-3">
			{#each data.notifications as notification (notification.id)}
				<form method="POST" action="?/open" use:openForm.enhance>
					<input type="hidden" name="notificationId" value={notification.id} />
					<button
						type="submit"
						class="w-full text-left"
						disabled={openForm.pending}
					>
						<Card.Root
							class={[
								'transition-colors hover:bg-accent/50',
								!notification.readAt && 'border-primary/50 bg-primary/5'
							]}
						>
							<Card.Header>
								<Card.Title>{notification.message}</Card.Title>
								<Card.Description class="flex items-center gap-2">
									{formatDate(notification.createdAt)}
									{#if openForm.pending}
										<LoaderCircle class="size-3.5 animate-spin text-muted-foreground" />
									{/if}
								</Card.Description>
							</Card.Header>
						</Card.Root>
					</button>
				</form>
			{/each}
		</div>
	{:else}
		<Empty.Root>
			<Empty.Header>
				<Empty.Title>No notifications yet</Empty.Title>
				<Empty.Description>You'll see updates from your groups here.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</div>
