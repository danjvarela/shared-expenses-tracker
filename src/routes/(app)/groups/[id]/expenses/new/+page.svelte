<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Combobox from '$lib/components/combobox.svelte';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { ArrowLeft, ChevronDown, Plus, Camera, X, FileText } from '@lucide/svelte';
	import { untrack, onDestroy } from 'svelte';
	import { enhance, applyAction } from '$app/forms';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import CameraCapture from '$lib/components/camera-capture.svelte';
	import LoadingButton from '$lib/components/loading-button.svelte';

	const { data, form } = $props();

	// Mirrors MAX_RECEIPT_BYTES in src/lib/server/app/receipt.ts
	const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

	let stagedFiles = $state<Array<{ file: File; previewUrl: string }>>([]);
	let fileInput: HTMLInputElement | undefined = $state();
	let cameraOpen = $state(false);
	let submitting = $state(false);

	function stageFile(file: File) {
		if (file.size > MAX_RECEIPT_BYTES) {
			toast.error(`${file.name || 'File'} is too large (max 10MB)`);
			return;
		}
		if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
			toast.error(`${file.name || 'File'} is not a supported file type`);
			return;
		}
		stagedFiles = [...stagedFiles, { file, previewUrl: URL.createObjectURL(file) }];
	}

	function onFileChosen() {
		const file = fileInput?.files?.[0];
		if (file) stageFile(file);
		if (fileInput) fileInput.value = '';
	}

	onDestroy(() => {
		for (const { previewUrl } of stagedFiles) URL.revokeObjectURL(previewUrl);
	});

	function removeStagedFile(index: number) {
		URL.revokeObjectURL(stagedFiles[index].previewUrl);
		stagedFiles = stagedFiles.filter((_, i) => i !== index);
	}

	function uploadStagedFilesInBackground(expenseId: string) {
		const files = stagedFiles;
		stagedFiles = [];
		for (const { file, previewUrl } of files) {
			URL.revokeObjectURL(previewUrl);
			const formData = new FormData();
			formData.append('file', file);
			fetch(`/groups/${data.group.id}/expenses/${expenseId}/receipts`, {
				method: 'POST',
				body: formData
			}).then(async (response) => {
				if (!response.ok) {
					const message = await response.text();
					toast.error(message || `Could not upload ${file.name}. Add it again from the expense.`);
				}
			});
		}
	}

	function extractExpenseId(location: string): string | null {
		const url = new URL(location, window.location.origin);
		const createdId = url.searchParams.get('createdId');
		if (createdId) return createdId;
		const match = url.pathname.match(/\/expenses\/([^/]+)$/);
		return match ? match[1] : null;
	}

	const today = new Date().toISOString().slice(0, 10);

	const NO_CATEGORY = 'none';

	let paidByUserId = $state(untrack(() => data.user?.id ?? data.members[0]?.userId ?? ''));
	let categoryId = $state(NO_CATEGORY);
	let anyDefaultsSet = $derived(data.members.some((member) => member.defaultSplitPercent !== null));
	let splitMethod: 'equal' | 'percentage' | 'exact' = $state(
		untrack(() => (anyDefaultsSet ? 'percentage' : 'equal'))
	);
	let customSplitOpen = $state(false);

	let included = $state(
		untrack(() => Object.fromEntries(data.members.map((member) => [member.userId, true])))
	);
	let percents = $state(
		untrack(() =>
			Object.fromEntries(
				data.members.map((member) => [member.userId, member.defaultSplitPercent ?? ''])
			)
		)
	);
	let exacts = $state(
		untrack(() => Object.fromEntries(data.members.map((member) => [member.userId, ''])))
	);

	function memberName(userId: string) {
		return data.members.find((member) => member.userId === userId)?.displayName ?? userId;
	}

	function paidByLabel() {
		return paidByUserId ? memberName(paidByUserId) : 'Select payer';
	}

	const categoryOptions = $derived([
		{ value: NO_CATEGORY, label: 'None' },
		...data.categories.map((category) => ({
			value: category.id,
			label: `${category.icon} ${category.name}`
		}))
	]);

	let splitSummary = $derived.by(() => {
		const includedCount = data.members.filter((member) => included[member.userId]).length;
		if (splitMethod === 'equal') {
			return `Splitting equally among ${includedCount} member${includedCount === 1 ? '' : 's'}`;
		}
		if (splitMethod === 'percentage') {
			const matchesDefaults = data.members.every(
				(member) => (percents[member.userId] ?? '') === (member.defaultSplitPercent ?? '')
			);
			const parts = data.members.map(
				(member) => `${memberName(member.userId)} ${percents[member.userId] || '0'}%`
			);
			return `${matchesDefaults ? 'Splitting by group defaults' : 'Splitting by percentage'}: ${parts.join(', ')}`;
		}
		return 'Splitting by exact amounts';
	});
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href="/groups/{data.group.id}/expenses" class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">Add expense</h1>

	<Card.Root>
		<Card.Content>
			<form
				method="POST"
				class="flex flex-col gap-4"
				use:enhance={() => {
					submitting = true;
					return async ({ result }) => {
						if (result.type === 'redirect') {
							const expenseId = extractExpenseId(result.location);
							if (expenseId && stagedFiles.length > 0) {
								uploadStagedFilesInBackground(expenseId);
							}
							submitting = false;
							await goto(result.location.replace(/\?createdId=[^&]+/, ''));
							return;
						}
						submitting = false;
						await applyAction(result);
					};
				}}
			>
				<Field.Field>
					<Field.FieldLabel for="description">Description</Field.FieldLabel>
					<Input id="description" name="description" required />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="amount">Amount ({data.group.currencyCode})</Field.FieldLabel>
					<Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="date">Date</Field.FieldLabel>
					<Input id="date" name="date" type="date" value={today} required />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="paidByUserId">Paid by</Field.FieldLabel>
					<Select.Root type="single" name="paidByUserId" bind:value={paidByUserId}>
						<Select.Trigger id="paidByUserId">{paidByLabel()}</Select.Trigger>
						<Select.Content>
							{#each data.members as member (member.userId)}
								<Select.Item value={member.userId}>{member.displayName}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="categoryId">Category</Field.FieldLabel>
					<Combobox
						id="categoryId"
						name="categoryId"
						options={categoryOptions}
						bind:value={categoryId}
						searchPlaceholder="Search categories..."
					/>
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel>Receipts (optional)</Field.FieldLabel>
					<div class="flex gap-2">
						<Button type="button" size="sm" variant="outline" onclick={() => (cameraOpen = true)}>
							<Camera class="size-4" />
							Take photo
						</Button>
						<Button type="button" size="sm" variant="outline" onclick={() => fileInput?.click()}>
							<Plus class="size-4" />
							Add
						</Button>
					</div>
					<input
						bind:this={fileInput}
						type="file"
						accept="image/*,application/pdf"
						class="hidden"
						onchange={onFileChosen}
					/>
					<CameraCapture bind:open={cameraOpen} onCapture={stageFile} />

					{#if stagedFiles.length > 0}
						<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
							{#each stagedFiles as { file, previewUrl }, index (previewUrl)}
								<div class="group relative aspect-square overflow-hidden rounded">
									{#if file.type === 'application/pdf'}
										<div
											class="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground"
										>
											<FileText class="size-8" />
											<span class="max-w-full truncate px-2 text-xs">PDF</span>
										</div>
									{:else}
										<img src={previewUrl} alt={file.name} class="h-full w-full object-cover" />
									{/if}
									<Button
										type="button"
										variant="destructive"
										size="icon"
										class="absolute top-1 right-1 size-7 shadow-sm"
										aria-label="Remove receipt"
										onclick={() => removeStagedFile(index)}
									>
										<X class="size-4" />
									</Button>
								</div>
							{/each}
						</div>
					{/if}
				</Field.Field>

				<Collapsible.Root bind:open={customSplitOpen}>
					<div class="flex items-center justify-between">
						<Field.FieldLabel>Custom split</Field.FieldLabel>
						<Collapsible.Trigger
							class="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
						>
							<ChevronDown
								class="size-4 transition-transform {customSplitOpen ? 'rotate-180' : ''}"
							/>
						</Collapsible.Trigger>
					</div>

					{#if !customSplitOpen}
						<p class="text-sm text-muted-foreground">{splitSummary}</p>
						<input type="hidden" name="splitMethod" value={splitMethod} />
						{#each data.members as member (member.userId)}
							{#if included[member.userId]}
								<input type="hidden" name={`included-${member.userId}`} value="on" />
							{/if}
							{#if splitMethod === 'percentage'}
								<input
									type="hidden"
									name={`percent-${member.userId}`}
									value={percents[member.userId]}
								/>
							{:else if splitMethod === 'exact'}
								<input
									type="hidden"
									name={`exact-${member.userId}`}
									value={exacts[member.userId]}
								/>
							{/if}
						{/each}
					{/if}

					<Collapsible.Content class="flex flex-col gap-4 pt-2">
						<Field.Field>
							<Field.FieldLabel>Split method</Field.FieldLabel>
							<RadioGroup.Root name="splitMethod" bind:value={splitMethod}>
								<div class="flex items-center gap-2">
									<RadioGroup.Item value="equal" id="method-equal" />
									<Label for="method-equal">Equal</Label>
								</div>
								<div class="flex items-center gap-2">
									<RadioGroup.Item value="percentage" id="method-percentage" />
									<Label for="method-percentage">Percentage</Label>
								</div>
								<div class="flex items-center gap-2">
									<RadioGroup.Item value="exact" id="method-exact" />
									<Label for="method-exact">Exact amounts</Label>
								</div>
							</RadioGroup.Root>
						</Field.Field>

						<Field.FieldSet>
							<Field.FieldLegend>Split between</Field.FieldLegend>
							{#each data.members as member (member.userId)}
								<div class="flex items-center gap-3">
									<Checkbox
										id={`included-${member.userId}`}
										name={`included-${member.userId}`}
										bind:checked={included[member.userId]}
									/>
									<Label for={`included-${member.userId}`} class="w-32 shrink-0">
										{member.displayName}
									</Label>

									{#if splitMethod === 'percentage'}
										<Input
											name={`percent-${member.userId}`}
											type="number"
											step="0.01"
											min="0"
											max="100"
											placeholder="%"
											disabled={!included[member.userId]}
											bind:value={percents[member.userId]}
										/>
									{:else if splitMethod === 'exact'}
										<Input
											name={`exact-${member.userId}`}
											type="number"
											step="0.01"
											min="0"
											placeholder={data.group.currencyCode}
											disabled={!included[member.userId]}
											bind:value={exacts[member.userId]}
										/>
									{/if}
								</div>
							{/each}
						</Field.FieldSet>
					</Collapsible.Content>
				</Collapsible.Root>

				{#if form?.error}
					<Field.FieldError>{form.error}</Field.FieldError>
				{/if}

				<div class="flex gap-2">
					<LoadingButton type="submit" formaction="?/create" pending={submitting}>
						Add expense
					</LoadingButton>
					<LoadingButton
						type="submit"
						formaction="?/createAndAddAnother"
						variant="outline"
						pending={submitting}
					>
						Save and add another
					</LoadingButton>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
