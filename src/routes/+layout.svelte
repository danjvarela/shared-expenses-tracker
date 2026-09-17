<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import ReloadPrompt from '$lib/components/reload-prompt.svelte';
	import InstallPromptInit from '$lib/components/install-prompt-init.svelte';
	import DemoBanner from '$lib/components/demo-banner.svelte';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher themeColors={{ light: '#ffffff', dark: '#0c0a09' }} />
<Toaster />
<ReloadPrompt />
<InstallPromptInit />
{#if data.appEnv === 'demo'}
	<DemoBanner />
{/if}
{@render children()}
