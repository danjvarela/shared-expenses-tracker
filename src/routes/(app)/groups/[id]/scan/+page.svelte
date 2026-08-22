<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { ArrowLeft, ChevronDown, LoaderCircle, ScanLine } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import type { ScanResult, ReceiptScanLineItem } from '$lib/server/app/interfaces/receipt-scanner';

	const { data } = $props();

	const NO_CATEGORY = 'none';
	const today = new Date().toISOString().slice(0, 10);

	type DraftLine = {
		description: string;
		amountDecimal: string;
		categoryId: string;
		date: string;
		percents: Record<string, string>;
		customSplitOpen: boolean;
	};

	let fileInput = $state<HTMLInputElement>();
	let scanning = $state(false);
	let confirming = $state(false);
	let scanResult = $state<ScanResult | null>(null);
	let storageKey = $state<string>('');
	let storageMeta = $state<{
		mime: string;
		sizeBytes: number;
		originalFilename: string | null;
	} | null>(null);
	let paidByUserId = $state(untrack(() => data.user?.id ?? data.members[0]?.userId ?? ''));
	let lines = $state<DraftLine[]>([]);

	function memberName(userId: string) {
		return data.members.find((member) => member.userId === userId)?.displayName ?? userId;
	}

	function paidByLabel() {
		return paidByUserId ? memberName(paidByUserId) : 'Select payer';
	}

	function categoryLabel(categoryId: string) {
		if (categoryId === NO_CATEGORY) return 'None';
		return data.categories.find((category) => category.id === categoryId)?.name ?? 'None';
	}

	function emptyPercents(): Record<string, string> {
		return Object.fromEntries(
			data.members.map((member) => [
				member.userId,
				member.defaultSplitPercent !== null ? String(member.defaultSplitPercent) : ''
			])
		);
	}

	function defaultLineDate(scanned: ScanResult | null): string {
		if (scanned?.date) {
			const parsed = new Date(scanned.date);
			if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
		}
		return today;
	}

	function lineFromItem(item: ReceiptScanLineItem, scanned: ScanResult): DraftLine {
		return {
			description: item.description,
			amountDecimal: item.amountDecimal,
			categoryId: NO_CATEGORY,
			date: defaultLineDate(scanned),
			percents: emptyPercents(),
			customSplitOpen: false
		};
	}

	async function onFileChosen() {
		const file = fileInput?.files?.[0];
		if (!file) return;

		scanning = true;
		try {
			const formData = new FormData();
			formData.append('file', file);

			const response = await fetch(`/groups/${data.group.id}/scan`, {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const message = await response.text();
				toast.error(message || 'Could not scan the receipt');
				return;
			}

			const {
				scanResult: scanned,
				storageKey: key,
				storageMeta: meta
			} = (await response.json()) as {
				scanResult: ScanResult;
				storageKey: string;
				storageMeta: { mime: string; sizeBytes: number; originalFilename: string | null };
			};
			scanResult = scanned;
			storageKey = key;
			storageMeta = meta;
			paidByUserId = data.user?.id ?? data.members[0]?.userId ?? '';
			lines = scanned.lineItems.map((item) => lineFromItem(item, scanned));
			toast.success('Receipt scanned');
		} catch {
			toast.error('Could not scan the receipt');
		} finally {
			scanning = false;
			if (fileInput) fileInput.value = '';
		}
	}

	function lineSum(): number {
		return lines.reduce((total, line) => total + (Number(line.amountDecimal) || 0), 0);
	}

	function totalMismatch(): boolean {
		if (!scanResult?.totalDecimal) return false;
		const sum = lineSum();
		const total = Number(scanResult.totalDecimal);
		if (Number.isNaN(total)) return false;
		return Math.abs(sum - total) > 0.01;
	}

	function discard() {
		scanResult = null;
		storageKey = '';
		storageMeta = null;
		lines = [];
	}

	async function confirm() {
		if (confirming) return;
		confirming = true;
		try {
			const response = await fetch(`/groups/${data.group.id}/scan/confirm`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					paidByUserId,
					storageKey,
					storageMeta,
					lines: lines.map((line) => ({
						description: line.description,
						amountDecimal: line.amountDecimal,
						categoryId: line.categoryId === NO_CATEGORY ? null : line.categoryId,
						date: line.date,
						percents: line.percents
					}))
				})
			});

			if (!response.ok) {
				const message = await response.text();
				toast.error(message || 'Could not save the expenses');
				return;
			}

			toast.success('Expenses saved');
			await goto(resolve(`/groups/${data.group.id}`));
		} catch {
			toast.error('Could not save the expenses');
		} finally {
			confirming = false;
		}
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href="/groups/{data.group.id}" class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">Scan receipt</h1>

	{#if !data.scannerEnabled}
		<Alert.Root>
			<Alert.Title>Scanning is off</Alert.Title>
			<Alert.Description>
				Receipt scanning is not configured for this group right now.
			</Alert.Description>
		</Alert.Root>
	{:else if !scanResult}
		<Card.Root>
			<Card.Content class="flex flex-col gap-4">
				<p class="text-sm text-muted-foreground">
					Upload a receipt and review the scanned items before saving. PDF, PNG, or JPEG —
					single-page only.
				</p>
				<input
					bind:this={fileInput}
					type="file"
					accept="application/pdf,image/png,image/jpeg"
					class="hidden"
					onchange={onFileChosen}
				/>
				<Button onclick={() => fileInput?.click()} disabled={scanning}>
					{#if scanning}
						<LoaderCircle class="size-4 animate-spin" />
						Scanning…
					{:else}
						<ScanLine class="size-4" />
						Upload receipt
					{/if}
				</Button>
				<p class="text-xs text-muted-foreground">
					HEIC isn't supported — most browsers convert it on pick.
				</p>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>Draft</Card.Title>
				<Card.Description>
					{#if scanResult.merchant}{scanResult.merchant}{:else}Scanned receipt{/if}
					{#if scanResult.date}
						· {scanResult.date}{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<Field.Field>
					<Field.FieldLabel for="paidByUserId">Paid by</Field.FieldLabel>
					<Select.Root type="single" bind:value={paidByUserId}>
						<Select.Trigger id="paidByUserId">{paidByLabel()}</Select.Trigger>
						<Select.Content>
							{#each data.members as member (member.userId)}
								<Select.Item value={member.userId}>{member.displayName}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>

				<div class="flex flex-col gap-4">
					{#each lines as line, i (i)}
						<div class="rounded-lg border p-3">
							<div class="flex flex-col gap-2">
								<Input
									bind:value={line.description}
									placeholder="Description"
									aria-label="Line description"
								/>
								<div class="flex gap-2">
									<Input
										bind:value={line.amountDecimal}
										type="number"
										step="0.01"
										min="0"
										placeholder={data.group.currencyCode}
										aria-label="Line amount"
									/>
									<Input bind:value={line.date} type="date" aria-label="Line date" class="w-40" />
								</div>
								<Select.Root type="single" bind:value={line.categoryId}>
									<Select.Trigger aria-label="Line category">
										{categoryLabel(line.categoryId)}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value={NO_CATEGORY}>None</Select.Item>
										{#each data.categories as category (category.id)}
											<Select.Item value={category.id}>
												{category.icon}
												{category.name}
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
							<Collapsible.Root bind:open={line.customSplitOpen} class="mt-2">
								<Collapsible.Trigger
									class="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
								>
									<ChevronDown
										class="size-3.5 transition-transform {line.customSplitOpen ? 'rotate-180' : ''}"
									/>
									Custom split
								</Collapsible.Trigger>
								<Collapsible.Content class="flex flex-col gap-1 pt-2">
									{#each data.members as member (member.userId)}
										<div class="flex items-center gap-2">
											<Label for={`percent-${i}-${member.userId}`} class="w-28 shrink-0 text-xs">
												{member.displayName}
											</Label>
											<Input
												id={`percent-${i}-${member.userId}`}
												type="number"
												step="0.01"
												min="0"
												max="100"
												placeholder="%"
												bind:value={line.percents[member.userId]}
											/>
										</div>
									{/each}
								</Collapsible.Content>
							</Collapsible.Root>
						</div>
					{/each}
				</div>

				{#if scanResult.totalDecimal}
					<div class="text-sm text-muted-foreground">
						Lines sum: {lineSum().toFixed(2)} · Receipt total: {scanResult.totalDecimal}
						{#if totalMismatch()}
							<span class="text-destructive"> (sum doesn't match the receipt total)</span>
						{/if}
					</div>
				{/if}

				<p class="text-xs text-muted-foreground">
					This draft isn't saved yet. Discarding clears it — you'd need to upload the receipt again
					to bring it back.
				</p>

				<div class="flex gap-2">
					<Button onclick={confirm} disabled={confirming}>
						{#if confirming}
							<LoaderCircle class="size-4 animate-spin" />
							Saving…
						{:else}
							Save expenses
						{/if}
					</Button>
					<Button variant="outline" onclick={discard} disabled={confirming}>Discard draft</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
