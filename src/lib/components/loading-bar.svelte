<script lang="ts">
	import { navigating } from '$app/state';
	import { fade } from 'svelte/transition';
</script>

{#if navigating.to}
	<div
		class="absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden bg-primary/10"
		transition:fade={{ duration: 150 }}
		aria-hidden="true"
	>
		<div class="loading-bar-track h-full w-1/3 rounded-full bg-primary"></div>
	</div>
{/if}

<style>
	@keyframes loading-bar-slide {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(300%);
		}
	}
	.loading-bar-track {
		animation: loading-bar-slide 1s ease-in-out infinite;
	}
</style>
