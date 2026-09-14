<script lang="ts">
	import { Button, type ButtonProps } from '$lib/components/ui/button/index.js';
	import { LoaderCircle } from '@lucide/svelte';

	let {
		pending = false,
		disabled = false,
		children,
		...rest
	}: ButtonProps & { pending?: boolean } = $props();
</script>

<Button {...rest} disabled={pending || disabled}>
	{#if pending}
		<LoaderCircle class="size-4 animate-spin" />
	{/if}
	{@render children?.()}
</Button>