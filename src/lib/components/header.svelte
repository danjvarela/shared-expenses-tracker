<script lang="ts">
	import { Wallet, Sun, Moon, Settings, LogOut } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { toggleMode } from 'mode-watcher';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import type { User } from '$lib/server/domain/user';

	let { user }: { user: User } = $props();

	async function logout() {
		await fetch('/logout', { method: 'POST' });
		goto(resolve('/login'));
	}

	function getInitials(displayName: string) {
		return displayName
			.split(' ')
			.map((part) => part[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}
</script>

<header class="flex items-center justify-center border-b">
	<div class="container flex justify-between items-center max-w-xl p-4">
		<a href={resolve('/')} class="flex items-center gap-2 no-underline">
			<div
				class="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
			>
				<Wallet class="size-4" />
			</div>
			<span class="font-semibold">Shared Expenses</span>
		</a>

		<div class="flex items-center gap-2">
			<Button variant="ghost" size="icon" onclick={toggleMode} aria-label="Toggle dark mode">
				<Sun class="size-4 scale-100 dark:scale-0" />
				<Moon class="absolute size-4 scale-0 dark:scale-100" />
			</Button>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					<Avatar.Root>
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
					<DropdownMenu.Item onclick={logout}>
						<LogOut class="size-4" />
						Log out
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>
</header>
