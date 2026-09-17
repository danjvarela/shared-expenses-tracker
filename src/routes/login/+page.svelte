<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Wallet } from '@lucide/svelte';

	let { data } = $props();

	let email = $state('');
	let password = $state('');
	let errorMessage = $state<string | null>(null);
	let submitting = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		errorMessage = null;
		submitting = true;
		try {
			const response = await fetch('/login/password', {
				method: 'POST',
				body: new URLSearchParams({ email, password })
			});
			if (response.redirected) {
				window.location.href = response.url;
				return;
			}
			if (!response.ok) {
				errorMessage = 'Invalid email or password.';
			}
		} finally {
			submitting = false;
		}
	}
</script>

<div class="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
	<div class="flex flex-col items-center gap-2">
		<div
			class="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground"
		>
			<Wallet class="size-5" />
		</div>
		<span class="text-lg font-semibold">Shared Expenses</span>
	</div>

	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title>Sign in</Card.Title>
			<Card.Description>Sign in to access your shared expenses.</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if data.demo}
				<Alert.Root>
					<Alert.Title>Demo accounts</Alert.Title>
					<Alert.Description>
						<p>Password: <strong>{data.demo.password}</strong></p>
						<ul class="list-inside list-disc">
							{#each data.demo.emails as demoEmail (demoEmail)}
								<li>{demoEmail}</li>
							{/each}
						</ul>
					</Alert.Description>
				</Alert.Root>

				<form class="flex flex-col gap-3" onsubmit={handleSubmit}>
					<div class="flex flex-col gap-1.5">
						<Label for="email">Email</Label>
						<Input id="email" name="email" type="email" bind:value={email} required />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="password">Password</Label>
						<Input id="password" name="password" type="password" bind:value={password} required />
					</div>
					{#if errorMessage}
						<p class="text-sm text-destructive">{errorMessage}</p>
					{/if}
					<Button type="submit" class="w-full" disabled={submitting}>Sign in</Button>
				</form>
			{:else}
				<Button href="/login/google" variant="outline" class="w-full">
					<svg viewBox="0 0 24 24" class="size-4">
						<path
							fill="#4285F4"
							d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"
						/>
						<path
							fill="#34A853"
							d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
						/>
						<path
							fill="#FBBC05"
							d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z"
						/>
						<path
							fill="#EA4335"
							d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
						/>
					</svg>
					Sign in with Google
				</Button>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
