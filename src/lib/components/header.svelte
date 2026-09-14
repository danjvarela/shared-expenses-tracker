<script lang="ts">
	import { Wallet, Settings, LogOut, LoaderCircle, Bell } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getInitials, avatarUrlFor } from '$lib/avatar';
	import { unreadBadge as formatUnreadBadge } from '$lib/unread';
	import type { User } from '$lib/server/domain/user';

	let { user, unreadCount }: { user: User; unreadCount: number } = $props();
	let unreadBadge = $derived(formatUnreadBadge(unreadCount));
	let avatarUrl = $derived(user.avatarStorageKey ? avatarUrlFor(user.id) : null);
	let loggingOut = $state(false);
	let pathname = $derived(page.url.pathname);
	let homeActive = $derived(pathname === '/');
	let settleActive = $derived(pathname.startsWith('/settle'));

	async function logout() {
		loggingOut = true;
		try {
			await fetch('/logout', { method: 'POST' });
			await goto(resolve('/login'));
		} finally {
			loggingOut = false;
		}
	}
</script>

<header
	class="hidden items-center justify-center border-b md:flex"
	style="padding-top: env(safe-area-inset-top)"
>
	<div class="container flex max-w-xl items-center justify-between p-4">
		<a href={resolve('/')} class="flex items-center gap-2 no-underline">
			<div
				class="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
			>
				<Wallet class="size-4" />
			</div>
			<span class="font-semibold">Shared Expenses</span>
		</a>

		<nav class="flex items-center gap-1" aria-label="Primary desktop">
			<Button
				variant="ghost"
				href={resolve('/')}
				aria-current={homeActive ? 'page' : undefined}
				class={homeActive ? 'text-primary' : 'text-muted-foreground'}
			>
				Home
			</Button>
			<Button
				variant="ghost"
				href={resolve('/(app)/settle')}
				aria-current={settleActive ? 'page' : undefined}
				class={settleActive ? 'text-primary' : 'text-muted-foreground'}
			>
				Settle
			</Button>
		</nav>

		<div class="flex items-center gap-2">
			<ThemeToggle />

			<Button
				variant="ghost"
				size="icon"
				class="relative"
				href={resolve('/(app)/notifications')}
				aria-label="Notifications"
			>
				<Bell class="size-4" />
				{#if unreadCount > 0}
					<Badge
						variant="destructive"
						class="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
					>
						{unreadBadge}
					</Badge>
				{/if}
			</Button>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					<Avatar.Root>
						{#if avatarUrl}
							<Avatar.Image src={avatarUrl} alt={user.displayName} />
						{/if}
						<Avatar.Fallback>{getInitials(user.displayName)}</Avatar.Fallback>
					</Avatar.Root>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-[200px]">
					<DropdownMenu.Label>
						You are logged in as <span class="font-bold">{user.displayName}</span>
					</DropdownMenu.Label>
					<DropdownMenu.Separator />
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={resolve('/(app)/account')}>
								<Settings class="size-4" />
								Account settings
							</a>
						{/snippet}
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={logout} disabled={loggingOut}>
						{#if loggingOut}
							<LoaderCircle class="size-4 animate-spin" />
						{:else}
							<LogOut class="size-4" />
						{/if}
						Log out
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>
</header>
