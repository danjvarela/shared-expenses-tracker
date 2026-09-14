<script lang="ts">
	import { initInstallPrompt } from '$lib/pwa/install-prompt.svelte';

	$effect(() => {
		initInstallPrompt();
	});
</script>