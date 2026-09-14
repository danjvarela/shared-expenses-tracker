interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const installState = $state({
	deferred: null as BeforeInstallPromptEvent | null,
	installed: false,
	isIOS: false
});

let initialized = false;

export function canInstall(): boolean {
	return !!installState.deferred && !installState.installed;
}

export function showCta(): boolean {
	return canInstall() || (!installState.installed && installState.isIOS);
}

function detectIOS(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent;
	if (/iphone|ipad|ipod/i.test(ua)) return true;
	// iPadOS 13+ reports as Mac desktop with touch.
	if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
	return false;
}

function detectInstalled(): boolean {
	if (typeof window === 'undefined') return false;
	if (window.matchMedia('(display-mode: standalone)').matches) return true;
	// Legacy iOS Safari property.
	if ('standalone' in navigator && navigator.standalone) return true;
	return false;
}

export function initInstallPrompt(): void {
	if (initialized || typeof window === 'undefined') return;
	initialized = true;

	installState.installed = detectInstalled();
	installState.isIOS = detectIOS();

	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		installState.deferred = e as BeforeInstallPromptEvent;
		installState.installed = false;
	});

	window.addEventListener('appinstalled', () => {
		installState.deferred = null;
		installState.installed = true;
	});
}

export async function promptInstall(): Promise<void> {
	if (!installState.deferred) return;
	const prompt = installState.deferred;
	installState.deferred = null;
	await prompt.prompt();
	await prompt.userChoice;
}