<script lang="ts">
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	type ComboboxOption = { value: string; label: string; triggerLabel?: string };

	let {
		options,
		value = $bindable(''),
		name,
		id,
		placeholder = 'Select...',
		searchPlaceholder = 'Search...',
		emptyText = 'No results found.',
		class: className
	}: {
		options: ComboboxOption[];
		value?: string;
		name?: string;
		id?: string;
		placeholder?: string;
		searchPlaceholder?: string;
		emptyText?: string;
		class?: string;
	} = $props();

	let open = $state(false);

	const selected = $derived(options.find((option) => option.value === value));
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				type="button"
				variant="outline"
				role="combobox"
				aria-expanded={open}
				class={cn('w-full justify-between font-normal', className)}
			>
				{selected ? (selected.triggerLabel ?? selected.label) : placeholder}
				<ChevronsUpDownIcon class="ml-2 size-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
		<Command.Root>
			<Command.Input placeholder={searchPlaceholder} />
			<Command.List>
				<Command.Empty>{emptyText}</Command.Empty>
				<Command.Group>
					{#each options as option (option.value)}
						<Command.Item
							value={option.label}
							onSelect={() => {
								value = option.value;
								open = false;
							}}
						>
							<CheckIcon class={cn('size-4', value !== option.value && 'opacity-0')} />
							{option.label}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
{#if name}
	<input type="hidden" {name} {value} />
{/if}
