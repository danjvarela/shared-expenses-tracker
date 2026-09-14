<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import ReloadPrompt from '$lib/components/reload-prompt.svelte';
	import InstallPromptInit from '$lib/components/install-prompt-init.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher themeColors={{ light: '#ffffff', dark: '#0c0a09' }} />
<Toaster />
<ReloadPrompt />
<InstallPromptInit />
{@render children()}
