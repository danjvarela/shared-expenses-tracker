<script lang="ts">
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Info } from '@lucide/svelte';
</script>

<Alert.Root class="rounded-none border-x-0 border-t-0" data-testid="demo-banner">
	<Info />
	<Alert.Description>
		This is a demo. Data is reset regularly and receipt scanning is unavailable.
	</Alert.Description>
</Alert.Root>
