<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import IconPicker from '$lib/components/icon-picker.svelte';
	import { ArrowLeft, CircleCheck, Pencil, X } from '@lucide/svelte';
	import { CURRENCIES } from '$lib/currency';
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';

	const { data, form } = $props();

	type InviteForm = {
		invite?: { status: string; email: string };
		message?: string;
	};
	const inviteForm = $derived(form as InviteForm | null);

	type CategoryForm = { source?: string; message?: string };
	const categoryForm = $derived(form as CategoryForm | null);
	let categoryAdded = $state(false);
	let editCategoryDialogOpen = $state(false);
	let editingCategory: { id: string; name: string; icon: string } | null = $state(null);

	function openEditCategory(category: { id: string; name: string; icon: string }) {
		editingCategory = category;
		editCategoryDialogOpen = true;
	}

	let avatarIcon: string | null = $state(untrack(() => data.group.avatarIcon));
	let currencyCode = $state(untrack(() => data.group.currencyCode));

	let detailsSaved = $state(false);
	let percentsSaved = $state(false);

	let removeDialogOpen = $state(false);
	let leaveDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);

	const isSolo = $derived(data.members.length === 1);

	function currencyLabel() {
		const currency = CURRENCIES.find((c) => c.code === currencyCode);
		return currency ? `${currency.code} — ${currency.name}` : currencyCode;
	}

	function initials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '?';
		if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
		return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
	}
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href="/groups/{data.group.id}" class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">{data.group.name} settings</h1>

	<Card.Root class="mb-4">
		<Card.Header>
			<Card.Title>Group details</Card.Title>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/details"
				class="flex flex-col gap-4"
				use:enhance={() => {
					detailsSaved = false;
					return async ({ result, update }) => {
						await update({ reset: false });
						detailsSaved = result.type === 'success';
					};
				}}
			>
				<Field.Field>
					<Field.FieldLabel for="name">Name</Field.FieldLabel>
					<Input id="name" name="name" required value={data.group.name} />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="currencyCode">Currency</Field.FieldLabel>
					<Select.Root type="single" name="currencyCode" bind:value={currencyCode}>
						<Select.Trigger id="currencyCode">{currencyLabel()}</Select.Trigger>
						<Select.Content>
							{#each CURRENCIES as currency (currency.code)}
								<Select.Item value={currency.code}>{currency.code} — {currency.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel>Icon</Field.FieldLabel>
					<IconPicker name="avatarIcon" bind:value={avatarIcon} />
				</Field.Field>

				{#if form?.error}
					<Field.FieldError>{form.error}</Field.FieldError>
				{/if}

				{#if detailsSaved}
					<Alert.Root>
						<CircleCheck class="size-4" />
						<Alert.Title>Details saved</Alert.Title>
					</Alert.Root>
				{/if}

				<Button type="submit">Save details</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Invite member</Card.Title>
			<Card.Description>
				Add someone to this group by email. If they haven't signed in yet, they'll appear as their
				email until their first login.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/invite"
				class="flex flex-col gap-4"
				use:enhance={() => {
					return async ({ update }) => {
						await update({ reset: false });
					};
				}}
			>
				<Field.Field>
					<Field.FieldLabel for="email">Email</Field.FieldLabel>
					<Input id="email" name="email" type="email" required placeholder="friend@example.com" />
				</Field.Field>

				{#if form?.source === 'invite' && inviteForm?.message}
					<Field.FieldError>{inviteForm.message}</Field.FieldError>
				{/if}

				{#if inviteForm?.invite?.status === 'invited'}
					<Alert.Root>
						<CircleCheck class="size-4" />
						<Alert.Title>Invited {inviteForm.invite.email}</Alert.Title>
					</Alert.Root>
				{:else if inviteForm?.invite?.status === 'already_member'}
					<Alert.Root>
						<Alert.Title>{inviteForm.invite.email} is already a member</Alert.Title>
					</Alert.Root>
				{/if}

				<Button type="submit">Send invite</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title>Categories</Card.Title>
			<Card.Description>
				Add a custom category for this group's expenses. Anyone in the group can add one.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.categories.length > 0}
				<ul class="mb-4 flex flex-wrap gap-2">
					{#each data.categories as category (category.id)}
						<Badge variant="secondary" class="gap-1 pr-1">
							{category.icon} {category.name}
							{#if category.ownerGroupId === data.group.id}
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="size-4"
									aria-label={`Edit ${category.name}`}
									onclick={() => openEditCategory(category)}
								>
									<Pencil class="size-3" />
								</Button>
							{/if}
							<form
								method="POST"
								action="?/removeCategory"
								use:enhance={() => {
									return async ({ update }) => {
										await update({ reset: false });
									};
								}}
							>
								<input type="hidden" name="categoryId" value={category.id} />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									class="size-4 hover:text-destructive"
									aria-label={`Remove ${category.name}`}
								>
									<X class="size-3" />
								</Button>
							</form>
						</Badge>
					{/each}
				</ul>
				{#if categoryForm?.source === 'removeCategory' && categoryForm?.message}
					<Field.FieldError class="mb-4">{categoryForm.message}</Field.FieldError>
				{/if}
			{/if}
			<form
				method="POST"
				action="?/addCategory"
				class="flex flex-col gap-4"
				use:enhance={() => {
					categoryAdded = false;
					return async ({ result, update }) => {
						await update();
						categoryAdded = result.type === 'success';
					};
				}}
			>
				<Field.Field>
					<Field.FieldLabel for="categoryName">Name</Field.FieldLabel>
					<Input id="categoryName" name="name" required placeholder="Groceries" />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel for="categoryIcon">Icon</Field.FieldLabel>
					<Input id="categoryIcon" name="icon" required placeholder="🛒" />
				</Field.Field>

				{#if categoryForm?.source === 'addCategory' && categoryForm?.message}
					<Field.FieldError>{categoryForm.message}</Field.FieldError>
				{/if}

				{#if categoryAdded}
					<Alert.Root>
						<CircleCheck class="size-4" />
						<Alert.Title>Category added</Alert.Title>
					</Alert.Root>
				{/if}

				<Button type="submit">Add category</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Dialog.Root bind:open={editCategoryDialogOpen}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Edit category</Dialog.Title>
			</Dialog.Header>
			{#if editingCategory}
				<form
					method="POST"
					action="?/editCategory"
					class="flex flex-col gap-4"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update({ reset: false });
							if (result.type === 'success') editCategoryDialogOpen = false;
						};
					}}
				>
					<input type="hidden" name="categoryId" value={editingCategory.id} />
					<Field.Field>
						<Field.FieldLabel for="editCategoryName">Name</Field.FieldLabel>
						<Input id="editCategoryName" name="name" required value={editingCategory.name} />
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel for="editCategoryIcon">Icon</Field.FieldLabel>
						<Input id="editCategoryIcon" name="icon" required value={editingCategory.icon} />
					</Field.Field>

					{#if categoryForm?.source === 'editCategory' && categoryForm?.message}
						<Field.FieldError>{categoryForm.message}</Field.FieldError>
					{/if}

					<Dialog.Footer>
						<Button type="submit">Save</Button>
					</Dialog.Footer>
				</form>
			{/if}
		</Dialog.Content>
	</Dialog.Root>

	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title>Members</Card.Title>
			<Card.Description>
				Remove a member who has settled all balances in this group. Their past expenses and splits
				stay visible.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if (form?.source === 'remove' || form?.source === 'leave') && form.message}
				<Alert.Root variant="destructive" class="mb-4">
					<Alert.Title>{form.message}</Alert.Title>
				</Alert.Root>
			{/if}
			<ul class="flex flex-col gap-2">
				{#each data.members as member (member.userId)}
					<li class="flex items-center justify-between gap-3">
						<div class="flex min-w-0 items-center gap-3">
							<Avatar.Root>
								<Avatar.Fallback>{initials(member.displayName)}</Avatar.Fallback>
							</Avatar.Root>
							<span class="truncate font-medium">{member.displayName}</span>
							{#if member.userId === data.user.id}
								<Badge variant="secondary">You</Badge>
							{/if}
							{#if member.invitedPending}
								<Badge variant="outline">Invited</Badge>
							{/if}
						</div>
						{#if member.userId === data.user.id}
							<div class="flex items-center gap-2">
								{#if member.hasOutstandingBalance}
									<span class="text-xs text-muted-foreground">Settle balances first</span>
								{/if}
								<AlertDialog.Root bind:open={leaveDialogOpen}>
									<AlertDialog.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												variant="destructive"
												size="sm"
												disabled={member.hasOutstandingBalance}>Leave</Button
											>
										{/snippet}
									</AlertDialog.Trigger>
									<AlertDialog.Content>
										<AlertDialog.Header>
											{#if isSolo}
												<AlertDialog.Title>Delete "{data.group.name}"?</AlertDialog.Title>
												<AlertDialog.Description>
													You are the last member. Leaving will permanently delete this group, along
													with all its expenses, settlements, and balances. This action cannot be
													undone.
												</AlertDialog.Description>
											{:else}
												<AlertDialog.Title>Leave "{data.group.name}"?</AlertDialog.Title>
												<AlertDialog.Description>
													You will lose access to this group. This can't be undone.
												</AlertDialog.Description>
											{/if}
										</AlertDialog.Header>
										<AlertDialog.Footer>
											<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
											<form
												method="POST"
												action={isSolo ? '?/delete' : '?/leave'}
												use:enhance={() => {
													return async ({ update }) => {
														leaveDialogOpen = false;
														await update({ reset: false });
													};
												}}
											>
												<AlertDialog.Action type="submit">
													{isSolo ? 'Delete group' : 'Leave group'}
												</AlertDialog.Action>
											</form>
										</AlertDialog.Footer>
									</AlertDialog.Content>
								</AlertDialog.Root>
							</div>
						{:else}
							<div class="flex items-center gap-2">
								{#if member.hasOutstandingBalance}
									<span class="text-xs text-muted-foreground">Settle balances first</span>
								{/if}
								<AlertDialog.Root bind:open={removeDialogOpen}>
									<AlertDialog.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												variant="destructive"
												size="sm"
												disabled={member.hasOutstandingBalance}>Remove</Button
											>
										{/snippet}
									</AlertDialog.Trigger>
									<AlertDialog.Content>
										<AlertDialog.Header>
											<AlertDialog.Title>Remove {member.displayName}?</AlertDialog.Title>
											<AlertDialog.Description>
												They will lose access to this group. Their past expenses and splits stay
												visible. This can't be undone.
											</AlertDialog.Description>
										</AlertDialog.Header>
										<AlertDialog.Footer>
											<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
											<form
												method="POST"
												action="?/remove"
												use:enhance={() => {
													return async ({ update }) => {
														removeDialogOpen = false;
														await update({ reset: false });
													};
												}}
											>
												<input type="hidden" name="userId" value={member.userId} />
												<AlertDialog.Action type="submit">Remove</AlertDialog.Action>
											</form>
										</AlertDialog.Footer>
									</AlertDialog.Content>
								</AlertDialog.Root>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>

	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title>Default split percentages</Card.Title>
			<Card.Description>
				Prefills new expense splits. Leave a member blank to fall back to an equal split; any
				percentages you do set must sum to 100.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/percents"
				class="flex flex-col gap-4"
				use:enhance={() => {
					percentsSaved = false;
					return async ({ result, update }) => {
						await update({ reset: false });
						percentsSaved = result.type === 'success';
					};
				}}
			>
				{#each data.members as member (member.userId)}
					<Field.Field>
						<Field.FieldLabel for={`percent-${member.userId}`}>
							{member.displayName}
						</Field.FieldLabel>
						<Input
							id={`percent-${member.userId}`}
							name={`percent-${member.userId}`}
							type="number"
							min="0"
							max="100"
							step="0.01"
							placeholder="Equal split"
							value={member.defaultSplitPercent ?? ''}
						/>
					</Field.Field>
				{/each}

				{#if form?.source === 'percents' && form?.message}
					<Field.FieldError>{form.message}</Field.FieldError>
				{/if}

				{#if percentsSaved}
					<Alert.Root>
						<CircleCheck class="size-4" />
						<Alert.Title>Percentages saved</Alert.Title>
					</Alert.Root>
				{/if}

				<Button type="submit">Save</Button>
			</form>
		</Card.Content>
	</Card.Root>

	{#if !isSolo}
		<Card.Root class="mt-4 border-destructive/50">
			<Card.Header>
				<Card.Title>Danger zone</Card.Title>
				<Card.Description>
					{#if data.hasOutstandingBalance}
						This group can't be deleted yet. You or other members still have an outstanding balance
						to settle.
					{:else}
						Deleting this group permanently removes it, along with all its expenses, settlements,
						and balances. This action cannot be undone.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if form?.source === 'delete' && form?.message}
					<Alert.Root variant="destructive" class="mb-4">
						<Alert.Title>{form.message}</Alert.Title>
					</Alert.Root>
				{/if}

				<AlertDialog.Root bind:open={deleteDialogOpen}>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="destructive" disabled={data.hasOutstandingBalance}>
								Delete group
							</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>Delete "{data.group.name}"?</AlertDialog.Title>
							<AlertDialog.Description>
								This will permanently delete this group, along with all its expenses, settlements,
								and balances. This action cannot be undone.
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
							<form
								method="POST"
								action="?/delete"
								use:enhance={() => {
									return async ({ update }) => {
										deleteDialogOpen = false;
										await update({ reset: false });
									};
								}}
							>
								<AlertDialog.Action type="submit">Delete group</AlertDialog.Action>
							</form>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
