<script lang="ts">
	import Header from '$lib/components/header.svelte';

	let { data, children } = $props();
</script>

<Header user={data.user} />
{@render children()}
