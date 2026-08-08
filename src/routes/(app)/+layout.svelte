<script lang="ts">
	import Header from '$lib/components/header.svelte';

	let { data, children } = $props();
</script>

<Header user={data.user} unreadCount={data.unreadCount} />
{@render children()}
