<script lang="ts">
	import { ArrowLeft, CircleCheck, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { getInitials, avatarUrlFor } from '$lib/avatar';
	import LoadingButton from '$lib/components/loading-button.svelte';
	import { useFormPending } from '$lib/forms/pending-enhance.svelte';

	const { data, form } = $props();
	const profileForm = useFormPending();
	const avatarForm = useFormPending();
	const avatarDeleteForm = useFormPending();
	const deleteAccountForm = useFormPending();

	type UpdateProfileForm = { source?: string; message?: string; success?: boolean };
	const updateProfileForm = $derived(form as UpdateProfileForm | null);

	type UpdateAvatarForm = { source?: string; message?: string; success?: boolean };
	const updateAvatarForm = $derived(
		form?.source === 'updateAvatar' ? (form as UpdateAvatarForm) : null
	);

	type DeleteAvatarForm = { source?: string; message?: string; success?: boolean };
	const deleteAvatarForm = $derived(
		form?.source === 'deleteAvatar' ? (form as DeleteAvatarForm) : null
	);

	let saved = $state(false);

	const avatarUrl = $derived(data.avatarStorageKey ? avatarUrlFor(data.userId) : null);
</script>

<div class="container mx-auto max-w-xl p-4">
	<Button variant="ghost" href={resolve('/')} class="mb-2 -ml-2">
		<ArrowLeft class="size-4" />
		Back
	</Button>
	<h1 class="mb-4 text-2xl font-semibold">Account settings</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>Profile</Card.Title>
			<Card.Description>The name others see when you share expenses.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateProfile"
				class="flex flex-col gap-4"
				use:profileForm.enhance={() => {
					saved = false;
					return async ({ result, update }) => {
						await update({ reset: false });
						saved = result.type === 'success';
						if (saved) toast.success('Display name updated');
					};
				}}
			>
				<Field.Field>
					<Field.FieldLabel for="displayName">Display name</Field.FieldLabel>
					<Input
						id="displayName"
						name="displayName"
						required
						maxlength={50}
						autocomplete="name"
						value={data.displayName}
					/>
				</Field.Field>

				{#if updateProfileForm?.source === 'updateProfile' && updateProfileForm?.message}
					<Field.FieldError>{updateProfileForm.message}</Field.FieldError>
				{/if}

				{#if saved}
					<Alert.Root>
						<CircleCheck class="size-4" />
						<Alert.Title>Display name updated</Alert.Title>
					</Alert.Root>
				{/if}

				<LoadingButton type="submit" pending={profileForm.pending}>Save</LoadingButton>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title>Avatar</Card.Title>
			<Card.Description>
				Shown next to your name across your groups. Images are resized and converted to webp.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex flex-col gap-4">
				<div class="flex items-center gap-4">
					<Avatar.Root class="size-16">
						{#if avatarUrl}
							<Avatar.Image src={avatarUrl} alt={data.displayName} />
						{/if}
						<Avatar.Fallback>{getInitials(data.displayName)}</Avatar.Fallback>
					</Avatar.Root>

					{#if data.avatarStorageKey}
						<form
							method="POST"
							action="?/deleteAvatar"
							use:avatarDeleteForm.enhance={() => {
								return async ({ result, update }) => {
									await update({ reset: false });
									if (result.type === 'success') toast.success('Avatar removed');
								};
							}}
						>
							<LoadingButton
								type="submit"
								variant="ghost"
								size="sm"
								class="text-destructive"
								pending={avatarDeleteForm.pending}
							>
								<Trash2 class="size-4" />
								Remove
							</LoadingButton>
						</form>
					{/if}
				</div>

				<form
					method="POST"
					action="?/updateAvatar"
					enctype="multipart/form-data"
					class="flex flex-col gap-4"
					use:avatarForm.enhance={() => {
						return async ({ result, update }) => {
							await update({ reset: false });
							if (result.type === 'success') toast.success('Avatar updated');
						};
					}}
				>
					<Field.Field>
						<Field.FieldLabel for="avatarFile">Upload a picture</Field.FieldLabel>
						<Input id="avatarFile" name="file" type="file" accept="image/*" required />
					</Field.Field>

					{#if updateAvatarForm?.message}
						<Field.FieldError>{updateAvatarForm.message}</Field.FieldError>
					{/if}

					{#if updateAvatarForm?.success}
						<Alert.Root>
							<CircleCheck class="size-4" />
							<Alert.Title>Avatar updated</Alert.Title>
						</Alert.Root>
					{/if}

					{#if deleteAvatarForm?.success}
						<Alert.Root>
							<CircleCheck class="size-4" />
							<Alert.Title>Avatar removed</Alert.Title>
						</Alert.Root>
					{/if}

					<LoadingButton type="submit" pending={avatarForm.pending}>Upload</LoadingButton>
				</form>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="mt-4 border-destructive">
		<Card.Header>
			<Card.Title>Delete account</Card.Title>
			<Card.Description>
				Erases your email and profile. Shared expense history and balances are kept and will show as
				"Deleted user".
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<div>
				<AlertDialog.Root>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="destructive">Delete account</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>Delete account?</AlertDialog.Title>
							<AlertDialog.Description>
								This is permanent and cannot be undone. Your email, avatar, and login are erased
								immediately. Shared expenses and balances you participated in are kept and will show
								as "Deleted user" so group history and balance math stay intact.
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
							<form
								method="POST"
								action="?/deleteAccount"
								use:deleteAccountForm.enhance
							>
								<LoadingButton
									type="submit"
									pending={deleteAccountForm.pending}
									class="text-destructive-foreground bg-destructive hover:bg-destructive/90"
								>
									Delete account
								</LoadingButton>
							</form>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			</div>
		</Card.Content>
	</Card.Root>
</div>
