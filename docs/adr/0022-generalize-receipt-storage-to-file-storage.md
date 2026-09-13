# Generalize receipt storage to file storage

The pluggable storage adapter introduced in ADR-0012 was receipt-shaped in name only — its method surface (`put`/`getReadUrl`/`getStream`/`delete`/`listKeys` of opaque byte blobs keyed by an adapter-issued `storageKey`) is domain-neutral. This ADR renames that interface from receipt-specific to domain-neutral and wires two configured instances in the container: one for receipts (existing behavior, unchanged) and one for avatars (configured, not yet used by UI). Each instance gets its own storage subdir so their orphan-GC scopes stay separate.

The interface is now `IFileStorageBackend` (with `FilePutInput`, `FilePutResult`, `FileStorageKey`, `FileStorageError`, `FileStorageConfigError`) and the factory is `createFileStorageBackend({ backend, fsDir, logger })`. The factory no longer hardcodes the `RECEIPT_*` env names; the container reads per-purpose env vars and passes them in, so the same factory wires both instances:

- **Receipts**: `RECEIPT_STORAGE_BACKEND` (default `fs`) and `RECEIPT_STORAGE_FS_DIR` (default `./uploads`) — unchanged from ADR-0012.
- **Avatars**: `AVATAR_STORAGE_BACKEND` (default `fs`) and `AVATAR_STORAGE_FS_DIR` (default `./uploads-avatars`) — new, gitignored, created on boot if missing.

The filesystem backend moves to `infra/file-storage/` and is renamed `createFileSystemFileStorageBackend`; behavior is byte-for-byte identical to the old `createFileSystemReceiptStorageBackend` (the only text changes are error messages generalizing "receipt" to "file", which are 500s not pinned by any test). The local-filesystem backend remains the only backend that ships; R2 and Google Drive stay deferred behind the same (now domain-neutral) interface.

## Why two instances, not one shared dir

A single shared storage dir would mix receipts and avatars in one key namespace and, worse, in one `listKeys()` enumeration. The receipt GC compares `listKeys()` against `SELECT storageKey FROM expense_receipt`; an avatar key in the same dir would look orphaned and get deleted. Separate dirs give each purpose its own GC scope — the receipt GC only ever enumerates receipt keys. The avatar slice (ticket 03/04) gets its own backend to call without duplicating adapter code or polluting the receipt GC scope. This is "make the change easy": the rename is a prefactor with no user-visible change.

## Why a domain-neutral name, not a second receipt-named adapter

Reusing the receipt-named interface for avatars would mean either importing `IReceiptStorageBackend` into avatar code (a lie) or copy-pasting the adapter. The interface was already domain-neutral in shape; only the name was receipt-specific. Renaming it once is cheaper than maintaining two parallel interfaces, and it leaves room for further file-storage uses (e.g. group cover images) without another rename.

## Consequences

- Receipt upload/serve/delete and the existing `/gc/receipts` job behave exactly as before; the receipt tests (`receipt.test.ts`, `receipt-gc.test.ts`, `fs.test.ts`, `scan.test.ts`) pass unchanged against the renamed interface.
- The container exports `avatarStorageBackend` for ticket 03/04 to consume; no UI uses it yet.
- Supersedes/amends ADR-0012's receipt-only framing: ADR-0012's adapter design and `storageKey`/put-first/row-first/GC reasoning still stand, but the interface is now `IFileStorageBackend` and the adapter is general file storage, not receipt-specific. ADR-0012's text is left in place as the original decision; this ADR is the generalization.