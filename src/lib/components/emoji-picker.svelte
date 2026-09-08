<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { onMount } from 'svelte';

	onMount(() => {
		import('emoji-picker-element');
	});

	let {
		value = $bindable(''),
		name,
		id
	}: { value: string; name: string; id?: string } = $props();

	let open = $state(false);

	function emojiPicker(node: HTMLElement) {
		function handler(event: Event) {
			value = (event as CustomEvent<{ unicode: string }>).detail.unicode;
			open = false;
		}
		node.addEventListener('emoji-click', handler);
		return () => node.removeEventListener('emoji-click', handler);
	}
</script>

<input type="hidden" {name} {value} />
<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} type="button" variant="outline" {id} class="w-16 text-lg">
				{value || '🙂'}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0">
		<emoji-picker {@attach emojiPicker}></emoji-picker>
	</Popover.Content>
</Popover.Root>
