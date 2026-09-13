# Receipt storage is a pluggable adapter; the DB holds metadata only

> **Amended/superseded by [ADR-0022](0022-generalize-receipt-storage-to-file-storage.md):** the adapter interface was renamed from receipt-specific (`IReceiptStorageBackend`) to domain-neutral (`IFileStorageBackend`), and the factory now wires two instances (receipts + avatars) with separate storage subdirs. This ADR's adapter design, `storageKey`/put-first/row-first reasoning, and GC enumeration model still stand; only the receipt-only framing of the interface name is superseded.

Receipt bytes never live in the database. The `expense_receipt` table (SQLite) stores metadata only: an opaque `storageKey` plus `mime`, `sizeBytes`, `originalFilename`, `uploadedByUserId`, and `uploadedAt`. The bytes themselves live in a pluggable storage backend selected at boot, and the DB row references them only through the opaque `storageKey`.

The `storageKey` is an opaque string, **not** a URL. Pluggable backends like Cloudflare R2 presign URLs and Google Drive export links with a finite TTL; a stored URL would expire and break the read path. A stable, backend-issued key lets the adapter mint fresh read access on demand, and survives a backend swap in principle (the key namespace is the adapter's concern, not the app's). The adapter generates the key; the app never constructs one.

The adapter interface is `IReceiptStorageBackend`:

- `put(stream, { mime, filename? }) → { key }` — streams bytes in, returns the adapter-generated key.
- `getReadUrl(key, ttlSeconds?) → string | null` — returns a presigned read URL, or `null` when the backend cannot presign (the local-filesystem backend cannot), so the read path falls back to streaming.
- `getStream(key) → ReadableStream<Uint8Array>` — streams bytes out.
- `delete(key) → void` — removes bytes, best-effort (no throw if the key is already gone).

Only the local-filesystem backend ships now. R2 (for a published deployment) and Google Drive (for personal use) are deferred behind the same interface; Drive in particular has open account/scope/sharing decisions that warrant their own ADR/epic before it is built. The backend is selected via env `RECEIPT_STORAGE_BACKEND` (default `fs`; an unknown value fails at boot, mirroring `OAuthConfigError`) and `RECEIPT_STORAGE_FS_DIR` (default `./uploads`, gitignored, created on boot if missing).

Single-receipt delete is **row-first**: the DB is the source of truth, so the `expense_receipt` row is deleted before `adapter.delete` is called, and `adapter.delete` is best-effort. A failed adapter delete leaves orphan bytes (wasteful, but not broken), whereas an adapter-first delete would leave a row pointing at deleted bytes — a broken image shown to users. Receipt create is **put-first** (the row needs the key): `adapter.put` runs, then `repo.create`; if `repo.create` throws, a best-effort `adapter.delete(key)` rollback runs and the error is rethrown. Both leak directions point the same way and leave no broken row.

Expense deletion uses the existing DB-level `onDelete: cascade` to remove `expense_receipt` rows; the backend bytes are orphaned and accepted, the same as a failed single-delete. Orphans are recoverable because both backends we care about are enumerable — fs via `readdir`, R2 via `listObjectsV2` — so a future gc pass compares the backend's enumerated keys against `SELECT storageKey FROM expense_receipt` and deletes the difference. That gc only needs an additive `listKeys()` method on the adapter interface, so it is pure addition with no rework to the four methods above.