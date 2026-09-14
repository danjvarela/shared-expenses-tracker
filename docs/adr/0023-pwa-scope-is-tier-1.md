# PWA scope is Tier 1; offline data deferred

The app becomes an installable PWA: web manifest + service worker (`@vite-pwa/sveltekit`, `registerType: 'prompt'`) precache the app shell and static assets, with a generic `offline.html` navigation fallback and an update-available toast (`useRegisterSW`) so a new version never reloads mid-form. Offline data access — cached reads (Tier 2) and offline writes with sync (Tier 3) — is deliberately deferred.

The fat-server architecture makes both expensive. All data flows through SvelteKit `PageServerLoad` + form actions against server-side libsql; `PairBalance` is incrementally maintained on server write (ADR-0004), the receipt scanner runs server-side (OCR.space + structuring LLM), and file serving (receipts, avatars) is auth-gated server endpoints. Offline reads need a client cache layer mirroring server responses; offline writes need a sync + conflict-resolution layer that must reconcile `PairBalance` without the server-side incremental maintenance. That cost is disproportionate for a Splitwise-style app where writes are usually online and `PairBalance` correctness is load-bearing.

Tier 1 delivers the installable, app-like shell plus mobile UI and loading states. The SW + manifest setup does not block adding a data-cache layer later — `@vite-pwa/sveltekit` supports `runtimeCaching` and a client store can be introduced without undoing the shell. The explicit no is to offline *data* in this pass, not to the PWA itself.

## Considered Options

- **Tier 1 — installable + offline shell (chosen).** Manifest + SW precache + offline fallback page. No offline data.
- **Tier 2 — offline reads of cached data (stale-while-revalidate).** SW/IndexedDB caches server load responses; reopen offline shows last-known data; writes still online. Deferred: marginal gain over Tier 1 for this app's usage, and the cache layer is the gateway to Tier 3's complexity.
- **Tier 3 — true offline writes + sync.** Client data store, write queue, conflict policy, `PairBalance` reconciliation. Deferred: large rewrite, collides with server-owned `PairBalance`, server-side scanner, and auth-gated file serving.

## Consequences

- Offline, the app shows a generic `offline.html` — no app chrome, no data. Reconnect is instant because shell assets are precached.
- SW updates prompt the user to reload; no silent mid-form reload.
- A future Tier 2/3 effort builds on this SW setup; nothing here is a blocker.