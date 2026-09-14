<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import { toast } from 'svelte-sonner';

	const { needRefresh, updateServiceWorker } = useRegisterSW();

	let dismissed = $state(false);

	$effect(() => {
		if (!$needRefresh || dismissed) return;
		const id = toast('Update available', {
			description: 'A new version of the app is ready.',
			duration: Infinity,
			action: { label: 'Reload', onClick: () => updateServiceWorker() },
			cancel: { label: 'Ignore', onClick: () => (dismissed = true) }
		});
		return () => toast.dismiss(id);
	});
</script>