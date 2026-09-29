<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Camera, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	// Keep captured frames at/under the server's own resize target (image-prep.ts
	// MAX_LONG_EDGE) so we never decode/hold a full-sensor-res bitmap on-device.
	const MAX_LONG_EDGE = 1568;
	const JPEG_QUALITY = 0.8;

	let {
		open = $bindable(false),
		onCapture
	}: {
		open?: boolean;
		onCapture: (file: File) => void;
	} = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let stream: MediaStream | null = null;
	let starting = $state(false);

	async function startStream() {
		starting = true;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
			if (videoEl) videoEl.srcObject = stream;
		} catch (err) {
			const name = err instanceof DOMException ? err.name : '';
			if (name === 'NotAllowedError') {
				toast.error('Camera permission denied. You can still pick a photo from your gallery.');
			} else if (name === 'NotFoundError') {
				toast.error('No camera found on this device.');
			} else {
				toast.error('Could not access the camera. Try picking a photo instead.');
			}
			open = false;
		} finally {
			starting = false;
		}
	}

	function stopStream() {
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}

	$effect(() => {
		if (open) startStream();
		return stopStream;
	});

	function capture() {
		if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return;

		const scale = Math.min(1, MAX_LONG_EDGE / Math.max(videoEl.videoWidth, videoEl.videoHeight));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(videoEl.videoWidth * scale);
		canvas.height = Math.round(videoEl.videoHeight * scale);

		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

		canvas.toBlob(
			(blob) => {
				if (!blob) {
					toast.error('Could not capture the photo');
					return;
				}
				onCapture(new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' }));
				open = false;
			},
			'image/jpeg',
			JPEG_QUALITY
		);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="h-dvh max-h-dvh w-screen max-w-none gap-0 border-0 p-0 sm:rounded-none"
	>
		<div class="relative flex h-full w-full flex-col bg-black">
			<Button
				variant="ghost"
				size="icon"
				class="absolute top-4 right-4 z-10 text-white hover:bg-white/10 hover:text-white"
				aria-label="Close camera"
				onclick={() => (open = false)}
			>
				<X class="size-5" />
			</Button>

			<div class="flex flex-1 items-center justify-center overflow-hidden">
				{#if starting}
					<p class="text-sm text-white/70">Starting camera…</p>
				{/if}
				<video
					bind:this={videoEl}
					autoplay
					muted
					playsinline
					class="h-full w-full object-contain"
				></video>
			</div>

			<div class="flex items-center justify-center py-6">
				<Button
					size="icon"
					class="size-16 rounded-full"
					aria-label="Take photo"
					onclick={capture}
					disabled={starting}
				>
					<Camera class="size-6" />
				</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
