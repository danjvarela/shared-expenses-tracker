<script lang="ts">
	import { House, Scale, Bell, User } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { unreadBadge as formatUnreadBadge } from '$lib/unread';
	import type { Component } from 'svelte';

	let { unreadCount }: { unreadCount: number } = $props();

	type Tab = {
		label: string;
		href: string;
		icon: Component;
		match: (pathname: string) => boolean;
		badge?: boolean;
	};

	const tabs: Tab[] = [
		{ label: 'Home', href: resolve('/'), icon: House, match: (p) => p === '/' },
		{
			label: 'Settle',
			href: resolve('/(app)/settle'),
			icon: Scale,
			match: (p) => p.startsWith('/settle')
		},
		{
			label: 'Notifications',
			href: resolve('/(app)/notifications'),
			icon: Bell,
			match: (p) => p.startsWith('/notifications'),
			badge: true
		},
		{
			label: 'Account',
			href: resolve('/(app)/account'),
			icon: User,
			match: (p) => p.startsWith('/account')
		}
	];

	let pathname = $derived(page.url.pathname);
	let unreadBadge = $derived(formatUnreadBadge(unreadCount));
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 border-t bg-background md:hidden"
	style="padding-bottom: env(safe-area-inset-bottom)"
	aria-label="Primary mobile"
>
	<div class="mx-auto flex max-w-xl items-stretch">
		{#each tabs as tab (tab.label)}
			{@const Icon = tab.icon}
			{@const active = tab.match(pathname)}
			<Button
				variant="ghost"
				href={tab.href}
				aria-label={tab.label}
				aria-current={active ? 'page' : undefined}
				class="flex h-auto flex-1 flex-col gap-0.5 rounded-none py-2 {active
					? 'text-primary'
					: 'text-muted-foreground'}"
			>
				<span class="relative flex justify-center">
					<Icon class="size-5" />
					{#if tab.badge && unreadCount > 0}
						<Badge
							variant="destructive"
							class="absolute -top-1.5 -right-2 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
						>
							{unreadBadge}
						</Badge>
					{/if}
				</span>
				<span class="text-[11px]">{tab.label}</span>
			</Button>
		{/each}
	</div>
</nav>
