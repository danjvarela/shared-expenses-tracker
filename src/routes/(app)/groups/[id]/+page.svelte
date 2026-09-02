<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { ArrowLeft, ChevronDown, Plus, Settings, ScanLine, Search } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { formatAmountCents } from '$lib/currency';
	import {
		groupExpensesForList,
		sectionExpensesByMonth,
		expenseListItemDate,
		nextVisibleCount,
		hasMoreToLoad,
		filterExpenses,
		RENDER_WINDOW_SIZE
	} from '$lib/expense-list-grouping';
	import { Input } from '$lib/components/ui/input/index.js';

	const { data } = $props();

	function formatAmount(amountCents: number) {
		return formatAmountCents(amountCents, data.group.currencyCode);
	}

	function formatDate(date: Date) {
		return new Date(date).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	let searchInput = $state(page.url.searchParams.get('search') ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined = undefined;
	let lastWritten = page.url.searchParams.get('search') ?? '';

	const filtered = $derived(filterExpenses(data.groupExpenses, { search: searchInput.trim() || null }));
	const items = $derived(groupExpensesForList(filtered));
	let visibleCount = $state(RENDER_WINDOW_SIZE);
	const sections = $derived(sectionExpensesByMonth(items.slice(0, visibleCount)));
	const hasMore = $derived(hasMoreToLoad(visibleCount, items.length));

	function loadMore() {
		visibleCount = nextVisibleCount(visibleCount, items.length);
	}

	$effect(() => {
		data.group.id;
		searchInput;
		visibleCount = RENDER_WINDOW_SIZE;
	});

	function setSearch(value: string) {
		const url = new URL(page.url);
		if (value) url.searchParams.set('search', value);
		else url.searchParams.delete('search');
		replaceState(url, {});
	}

	$effect(() => {
		const urlSearch = page.url.searchParams.get('search') ?? '';
		if (urlSearch !== lastWritten) {
			searchInput = urlSearch;
			lastWritten = urlSearch;
		}
	});

	$effect(() => {
		const value = searchInput.trim();
		if (value === lastWritten) return;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			lastWritten = value;
			setSearch(value);
		}, 250);
	});

	$effect(() => {
		return () => {
			if (searchTimer) clearTimeout(searchTimer);
		};
	});

	function clearSearch() {
		searchInput = '';
		lastWritten = '';
		setSearch('');
	}

	function loadMoreSentinel(node: HTMLElement, _visibleCount: number) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) loadMore();
			},
			{ rootMargin: '200px' }
		);
		observer.observe(node);
		return {
			update() {
				observer.disconnect();
				observer.observe(node);
			},
			destroy() {
				observer.disconnect();
			}
		};
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href={resolve('/')} class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-semibold">{data.group.name}</h1>
		<div class="flex gap-2">
			<Button variant="outline" size="icon" href="{data.group.id}/settings" aria-label="Settings">
				<Settings class="size-4" />
			</Button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} size="icon" aria-label="Add expense">
							<Plus class="size-4" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-[200px]">
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href="{data.group.id}/expenses/new">
								<Plus class="size-4" />
								Add expense
							</a>
						{/snippet}
					</DropdownMenu.Item>
					{#if data.scannerEnabled}
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a {...props} href="{data.group.id}/scan">
									<ScanLine class="size-4" />
									Scan receipt
								</a>
							{/snippet}
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	{#if data.hasOutstandingDebt}
		<Alert.Root class="mb-4">
			<Alert.Title>You have pending balances</Alert.Title>
			<Alert.Action class="top-1/2 -translate-y-1/2">
				<Button size="sm" href="{data.group.id}/settle">Settle up</Button>
			</Alert.Action>
		</Alert.Root>
	{/if}

	{#if data.groupExpenses.length}
		<div class="mb-4 flex flex-col gap-2">
			<div class="relative">
				<Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="search"
					placeholder="Search"
					bind:value={searchInput}
					class="pl-8"
					aria-label="Search expenses"
				/>
			</div>
			{#if searchInput.trim()}
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant="secondary">
						<span class="truncate">Search: "{searchInput.trim()}"</span>
					</Badge>
					<Button variant="ghost" size="sm" onclick={clearSearch}>Clear</Button>
				</div>
			{/if}
		</div>
		<div class="flex flex-col gap-6">
			{#each sections as section (section.monthKey)}
				<section class="flex flex-col gap-3">
					<h2 class="text-sm font-medium text-muted-foreground">{section.monthLabel}</h2>
					{#each section.items as item (item.kind === 'single' ? item.expense.id : item.expenseGroupId)}
						{#if item.kind === 'single'}
							{@const expense = item.expense}
							<a href="{data.group.id}/expenses/{expense.id}">
								<Card.Root class="transition-colors hover:bg-accent/50">
									<Card.Header>
										<Card.Title>{expense.description}</Card.Title>
										<Card.Description>
											Paid by {expense.paidByName} · {formatDate(expense.date)}
										</Card.Description>
										<Card.Action class="flex items-center gap-2 text-lg font-semibold">
											{formatAmount(expense.amountCents)}
										</Card.Action>
									</Card.Header>
									<Card.Content class="text-sm text-muted-foreground">
										{#if expense.categoryName}
											{expense.categoryIcon}
											{expense.categoryName}
										{/if}
									</Card.Content>
								</Card.Root>
							</a>
						{:else}
							{@const firstChild = item.children[0]}
							{@const repDate = expenseListItemDate(item)}
							<Collapsible.Root class="group">
								<Collapsible.Trigger class="w-full text-left">
									<Card.Root
										class="transition-colors group-data-[state=open]:bg-muted/40 hover:bg-accent/50"
									>
										<Card.Header>
											<Card.Title>Scanned receipt</Card.Title>
											<Card.Description>
												Paid by {firstChild.paidByName} · {formatDate(repDate)}
											</Card.Description>
											<Card.Action class="flex items-center gap-2 text-lg font-semibold">
												<Badge variant="secondary">{item.children.length} items</Badge>
												{formatAmount(item.totalCents)}
											</Card.Action>
										</Card.Header>
										<Card.Content
											class="flex items-center justify-between text-sm text-muted-foreground"
										>
											<span>Expand to view line items</span>
											<ChevronDown
												class="size-4 transition-transform group-data-[state=open]:rotate-180"
											/>
										</Card.Content>
									</Card.Root>
								</Collapsible.Trigger>
								<Collapsible.Content>
									<div class="mt-2 flex flex-col gap-2 border-l-2 border-muted pl-3">
										{#each item.children as child (child.id)}
											<a
												href="{data.group.id}/expenses/{child.id}"
												class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
											>
												<span class="flex flex-col">
													<span class="font-medium">{child.description}</span>
													<span class="text-muted-foreground">
														{#if child.paidByName !== firstChild.paidByName || child.date.valueOf() !== repDate.valueOf()}
															Paid by {child.paidByName} · {formatDate(
																child.date
															)}{#if child.categoryName}
																· {child.categoryIcon} {child.categoryName}{/if}
														{:else if child.categoryName}
															{child.categoryIcon} {child.categoryName}
														{/if}
													</span>
												</span>
												<span class="font-semibold">
													{formatAmount(child.amountCents)}
												</span>
											</a>
										{/each}
									</div>
								</Collapsible.Content>
							</Collapsible.Root>
						{/if}
					{/each}
				</section>
			{/each}
			{#if hasMore}
				<div use:loadMoreSentinel={visibleCount} class="h-1 w-full" aria-hidden="true"></div>
			{/if}
		</div>
	{:else}
		<Empty.Root>
			<Empty.Header>
				<Empty.Title>No expenses yet</Empty.Title>
				<Empty.Description>
					This group has no expenses yet. Get started by adding one.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button href="{data.group.id}/expenses/new">Add expense</Button>
			</Empty.Content>
		</Empty.Root>
	{/if}
</div>
