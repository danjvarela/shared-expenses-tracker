<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		Users,
		Home,
		Plane,
		UtensilsCrossed,
		Car,
		ShoppingBag,
		PartyPopper,
		Heart,
		Briefcase,
		Gift
	} from '@lucide/svelte';

	export const ICON_NAMES = [
		'Users',
		'Home',
		'Plane',
		'UtensilsCrossed',
		'Car',
		'ShoppingBag',
		'PartyPopper',
		'Heart',
		'Briefcase',
		'Gift'
	] as const;

	const icons: Record<(typeof ICON_NAMES)[number], typeof Users> = {
		Users,
		Home,
		Plane,
		UtensilsCrossed,
		Car,
		ShoppingBag,
		PartyPopper,
		Heart,
		Briefcase,
		Gift
	};

	let { value = $bindable(null), name }: { value: string | null; name: string } = $props();
</script>

<input type="hidden" {name} {value} />
<div class="flex flex-wrap gap-2">
	{#each ICON_NAMES as iconName (iconName)}
		{@const Icon = icons[iconName]}
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
