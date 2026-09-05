# Roadmap

Status tags: `Done`, `In progress`, `Not started`, `Flagged` (design undecided, see Open questions).

## Groups

- [x] Done — Group creation (name, optional `avatarIcon`, user-selected `currencyCode` display-only — see ADR-0007). Solo creation only, creator becomes sole member.
- [x] Done — Update group detail (name, currencyCode, avatarIcon). Any member may edit. App-wide membership guard added for `groups/[id]/*` routes as part of this work.
- [x] Done — Delete group (blocked while any nonzero `PairBalance` exists in the group; hard delete, cascades Expenses/Settlements/PairBalances once clear via DB-level `ON DELETE CASCADE`). Danger-zone card on group settings page, any member may delete.
- [x] Done — Invite user to group by email (any member may invite; pre-login User seeded with `displayName = email`, replaced with Google name on first login — see ADR-0009)
- [x] Done — Set default split percentages per member (`GroupMember.defaultSplitPercent`, prefill-only, unenforced sum — see ADR-0005). Schema, service, whole-group settings UI, and prefill into the expense-add split UI all done.
- [x] Done — Kick user from group (blocked while that member has any nonzero `PairBalance` in the group; settings page action via shared `remove-member` service, same as Leave)
- [x] Done — View a group's members/expenses/balances (read-only)

## Expenses

- [x] Done — View a group's expenses (read-only list)
- [x] Done — Expense list UI revamp: sort by date w/ month sections, load-more render window, filter (category, payer, date range) + search toolbar, no-matches empty state. Settlement-state filter not included.
- [x] Done — Add expense manually (form)
- [ ] Not started — Add expense via free-text input (AI-generated fields)
- [x] Done — Scan receipt to add multiple expenses — pluggable scanner backend behind `IReceiptScanner`, selected via env `RECEIPT_SCANNER_BACKEND` (unset = scan UI not rendered; unknown = boot fail). Dumb scanner: bytes + mime in, `ScanResult` (line items only, no currency/category) out; app maps to a draft ExpenseGroup the user edits then confirms. One backend ships: `ocr` (OCR.space text extraction + a boot-selectable structuring LLM composition, `OCR_API_KEY`, ADR-0015/ADR-0016). The text→`ScanResult` structuring step is pluggable via env `STRUCTURING_BACKEND` (default `ollama` → `OLLAMA_BASE_URL` + `OLLAMA_TEXT_MODEL` + optional `OLLAMA_API_KEY`; `google` → `GOOGLE_API_KEY` + `GEMINI_MODEL`, both required, no default; unknown = boot fail; ignored when scanner is off) behind `IReceiptStructurer` (infra-internal), so Ollama and Google AI / Gemini can be compared by swapping one env var and re-scanning — ADR-0020. `scan.ts` is mime-agnostic; OCR.space takes PDFs natively (no scanner-side rasterize). Blocking request for now, background-job deferred.
- [x] Done — `ExpenseGroup` entity — modeled in `CONTEXT.md` + ADR-0013:
  - Every `Expense.expenseGroupId` is non-null (manual single-add is wrapped in its own one-child `ExpenseGroup` — no batchless Expense, no nullable special case)
  - `ExpenseGroup` is `{ id, groupId, createdAt }` only — carries no defaults; scanned-line payer defaults to the scanning user, splits come from `GroupMember.defaultSplitPercent`, both applied at draft time
  - Each child is a plain, full `Expense` — own category, own payer, own splits, independently editable after creation (no live inheritance)
  - `ExpenseReceipt` attaches to the `ExpenseGroup`, not the `Expense` (one source photo shared by a scanned batch's children); existing `expense_receipt` + every `Expense` backfilled in a single migration
  - UI collapses a multi-child `ExpenseGroup` into one expandable row; a one-child `ExpenseGroup` renders as a normal expense row and is never shown as a "group"
- [x] Done — Update expense
- [x] Done — Delete expense
- [x] Done — Settlement recording UI (`/settle` page: per-counterparty-per-group debt cards, partial settlement dialog, homepage "pending balances" banner)
- [x] Done — Per-group settlement UI (`/groups/[id]/settle`, scoped to that group's debts, "pending balances" banner on group page)

## Account settings

- [ ] Not started — Change display name
- [ ] Not started — Update profile picture

## Receipts

- [x] Done — Receipt image storage: pluggable backend selected via env `RECEIPT_STORAGE_BACKEND` (default `fs`; unknown fails at boot). `IReceiptStorageBackend` adapter interface ships with a local-filesystem impl; R2 (published deployment) and Google Drive (personal use) deferred behind the same interface — see ADR-0012.
- [x] Done — Upload + display an image receipt on the expense detail page (`/groups/[id]/expenses/[expenseId]`), end-to-end (fs adapter, `expense_receipt` table, membership-guarded endpoints).
- [x] Done — Delete a receipt (row-first DB delete, best-effort `adapter.delete`; idempotent; trash button + confirm Dialog on detail page).
- [x] Done — PDF receipts (`application/pdf` in upload allowlist; detail page renders `<object type="application/pdf">` with new-tab fallback).
- [x] Done — Receipt orphan gc: `POST /gc/receipts` (outside the `(app)` group, token-gated by env `GC_SECRET` — boot fails if unset) reconciles `storageBackend.listKeys()` against `expense_receipt.storageKey` via `receipt-gc.ts`. Orphan = absent from DB AND older than a 24h grace period (protects mid-upload receipts). Defaults to dry-run; `{ apply: true }` performs best-effort per-key deletes. Response `{ dryRun, totalKeys, orphanCount, orphanKeys, deletedKeys }`.

## Additional suggested features

- [ ] Not started — Expense comments/notes (free-text per expense, beyond category)
- [ ] Not started — Activity/audit log per group (who added/edited/deleted what, when)
- [x] Done — In-app notifications on new expense and settlement (`Notification` row + bell/badge + `/notifications` list, fire-and-forget from `app/expense.ts`/`app/settlement.ts`). Push/email and group-invite notifications not started — would need a provider ADR and `NotificationPreference` concept first.
- [ ] Not started — Recurring expenses (auto-create on a schedule, e.g. monthly rent)
- [ ] Not started — Export group data (CSV/PDF of expenses and balances)
- [ ] Not started — Multi-group dashboard (cross-group total owed / owed-to-you)

## Dev environment

- [ ] Not started — Cloudflare Tunnel in devenv: expose the app's running port to a public `*.trycloudflare.com` (or named) URL so the local dev server is reachable from the cloud (e.g. for mobile testing / OAuth callbacks). Wired into `devenv.nix` alongside the existing services.

## Open questions

- **Receipt storage backend rollout**: `fs` ships now behind `IReceiptStorageBackend`. R2 (published deployment) and Google Drive (personal use) still deferred behind the same interface — Drive in particular has open account/scope/sharing decisions warranting their own ADR/epic.
