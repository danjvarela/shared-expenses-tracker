<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { ICON_NAMES, GROUP_ICONS } from '$lib/group-icons';

	let { value = $bindable(null), name }: { value: string | null; name: string } = $props();
</script>

<input type="hidden" {name} {value} />
<div class="flex flex-wrap gap-2">
	{#each ICON_NAMES as iconName (iconName)}
		{@const Icon = GROUP_ICONS[iconName]}
		<Button
			type="button"
			variant={value === iconName ? 'default' : 'outline'}
			size="icon"
			onclick={() => (value = value === iconName ? null : iconName)}
			aria-label={iconName}
		>
			<Icon class="size-4" />
		</Button>
	{/each}
</div>
