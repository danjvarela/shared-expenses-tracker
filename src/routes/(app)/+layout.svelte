<script lang="ts">
	import { navigating, page } from '$app/state';
	import Header from '$lib/components/header.svelte';
	import BottomNav from '$lib/components/bottom-nav.svelte';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import LoadingBar from '$lib/components/loading-bar.svelte';
	import ListSkeleton from '$lib/components/list-skeleton.svelte';

	let { data, children } = $props();

	const LIST_ROUTES = new Set(['/(app)/groups/[id]', '/(app)/settle', '/(app)/notifications']);
	let listSkeletonRouteId = $derived.by(() => {
		const id = navigating.to?.route.id;
		return id && LIST_ROUTES.has(id) ? id : null;
	});

	const ROUTE_TITLES: Record<string, string> = {
		'/': 'Shared Expenses',
		'/(app)/settle': 'Settle up',
		'/(app)/notifications': 'Notifications',
		'/(app)/account': 'Account',
		'/(app)/groups/new': 'New group',
		'/(app)/groups/[id]': 'Expenses',
		'/(app)/groups/[id]/settings': 'Group settings',
		'/(app)/groups/[id]/settle': 'Settle up',
		'/(app)/groups/[id]/expenses/new': 'New expense',
		'/(app)/groups/[id]/expenses/[expenseId]': 'Expense',
		'/(app)/groups/[id]/expenses/[expenseId]/edit': 'Edit expense',
		'/(app)/groups/[id]/expenses/[expenseId]/receipts': 'Receipts',
		'/(app)/groups/[id]/expenses/[expenseId]/receipts/[receiptId]': 'Receipt',
		'/(app)/groups/[id]/scan': 'Scan receipt',
		'/(app)/groups/[id]/scan/confirm': 'Confirm scan',
		'/(app)/groups/[id]/settlements': 'Settlements',
		'/(app)/groups/[id]/settlements/[settlementId]': 'Settlement'
	};
	let mobileTitle = $derived(ROUTE_TITLES[page.route.id ?? ''] ?? 'Shared Expenses');
</script>

<Header user={data.user} unreadCount={data.unreadCount} />

<header
	class="flex items-center justify-center border-b md:hidden"
	style="padding-top: env(safe-area-inset-top)"
>
	<div class="relative container flex max-w-xl items-center justify-center p-4">
		<span class="font-semibold">{mobileTitle}</span>
		<div class="absolute right-4">
			<ThemeToggle />
		</div>
	</div>
</header>

<div class="relative pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
	<LoadingBar />
	{#if listSkeletonRouteId}
		<ListSkeleton routeId={listSkeletonRouteId} />
	{:else}
		{@render children()}
	{/if}
</div>

<BottomNav unreadCount={data.unreadCount} />
