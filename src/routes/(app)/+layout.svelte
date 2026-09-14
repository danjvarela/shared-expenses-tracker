<script lang="ts">
	import { navigating } from '$app/state';
	import Header from '$lib/components/header.svelte';
	import LoadingBar from '$lib/components/loading-bar.svelte';
	import ListSkeleton from '$lib/components/list-skeleton.svelte';

	let { data, children } = $props();

	const LIST_ROUTES = new Set(['/(app)/groups/[id]', '/(app)/settle', '/(app)/notifications']);
	let listSkeletonRouteId = $derived.by(() => {
		const id = navigating.to?.route.id;
		return id && LIST_ROUTES.has(id) ? id : null;
	});
</script>

<Header user={data.user} unreadCount={data.unreadCount} />
<div class="relative">
	<LoadingBar />
	{#if listSkeletonRouteId}
		<ListSkeleton routeId={listSkeletonRouteId} />
	{:else}
		{@render children()}
	{/if}
</div>
