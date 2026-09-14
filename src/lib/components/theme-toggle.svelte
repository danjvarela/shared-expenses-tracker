<script lang="ts">
	import { Sun, Moon } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toggleMode } from 'mode-watcher';
</script>

<Button variant="ghost" size="icon" onclick={toggleMode} aria-label="Toggle dark mode">
	<Sun class="size-4 scale-100 dark:scale-0" />
	<Moon class="absolute size-4 scale-0 dark:scale-100" />
</Button>
