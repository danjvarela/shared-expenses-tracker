import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const offlinePath = resolve(process.cwd(), 'static/offline.html');
const offlineRevision = createHash('sha1')
	.update(readFileSync(offlinePath))
	.digest('hex')
	.slice(0, 8);

export default defineConfig({
	server: {
		port: 5174,
		strictPort: true,
		allowedHosts: process.env.CLOUDFLARE_TUNNEL_HOSTNAME
			? [process.env.CLOUDFLARE_TUNNEL_HOSTNAME]
			: undefined
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter({ out: process.env.BUILD_OUT_DIR ?? 'build' }),

			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		}),
		SvelteKitPWA({
			registerType: 'prompt',
			manifest: {
				name: 'Shared Expenses',
				short_name: 'Expenses',
				description: 'Track shared expenses and settle balances with your groups.',
				display: 'standalone',
				theme_color: '#008236',
				background_color: '#ffffff',
				start_url: '/',
				scope: '/',
				icons: [
					{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/maskable-192x192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'maskable'
					},
					{
						src: '/maskable-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				navigateFallback: undefined,
				navigateFallbackDenylist: [/./],
				additionalManifestEntries: [{ url: 'offline.html', revision: offlineRevision }]
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
