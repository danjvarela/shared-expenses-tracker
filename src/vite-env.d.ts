declare module 'virtual:pwa-register/svelte' {
	import type { Writable } from 'svelte/store';

	export interface RegisterSWOptions {
		immediate?: boolean;
		onNeedRefresh?: () => void;
		onOfflineReady?: () => void;
		onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void;
		onRegisterError?: (error: unknown) => void;
	}

	export function useRegisterSW(
		options?: RegisterSWOptions
	): {
		needRefresh: Writable<boolean>;
		offlineReady: Writable<boolean>;
		updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
	};
}