# Every Expense belongs to an ExpenseGroup; receipts attach to the group

A scanned receipt is many line items — a 30-row grocery receipt must not flood the expense list as 30 separate rows, yet each line is a real, independently-editable Expense (own payer, own splits, own category) that participates in `PairBalance` like any other. We introduce `ExpenseGroup` as the universal wrapper: **every** `Expense` belongs to exactly one `ExpenseGroup` (non-null `expenseGroupId`), and an `ExpenseReceipt` attaches to the `ExpenseGroup`, not the `Expense`. A manually-added single expense is wrapped in its own one-child `ExpenseGroup` — there is no nullable special case and no batchless Expense.

The UI collapses a multi-child `ExpenseGroup` into one expandable row; a one-child `ExpenseGroup` renders as a single normal expense row and is never labeled as a "group." `PairBalance` is unaffected — each child Expense carries its own `ExpenseSplit`s as today.

`ExpenseGroup` carries no defaults of its own. The roadmap's earlier sketch had it supply payer/split defaults copied down to children; we dropped that: the payer for scanned lines defaults to the scanning user (editable in the draft), and the split arrangement comes from `GroupMember.defaultSplitPercent` (ADR-0005), both applied at draft time. So `ExpenseGroup` is just `{ id, groupId, createdAt }` — a grouping identity, nothing more. An `ExpenseGroup` with one child is the normal state of every manual expense, so deleting a scanned batch down to one survivor leaves a one-child group, which is identical in shape to any manual expense — no auto-dissolve, no provenance field, no special case.

`ExpenseReceipt` moves from `expense_id` (1:N from Expense) to `expense_group_id` (1:N from ExpenseGroup). The single source photo for a scanned batch sits on the batch and is shared by all children; a manual expense's receipt sits on that expense's own one-child group. This supersedes the "1:N from Expense" shape recorded in ADR-0012's prose — the storage-adapter interface (`IReceiptStorageBackend`) is unchanged; only the DB owner column moves.

## Backfill

Existing `Expense` rows predate `ExpenseGroup`, and existing `expense_receipt` rows point at `expense_id`. The migration is a single backfill, not lazy:

1. Create `expense_group (id, group_id, created_at)`.
2. Add `expense.expense_group_id` (nullable first).
3. For every existing `Expense`, insert a one-child `ExpenseGroup` in the same `Group` and set `expense.expense_group_id`.
4. Make `expense.expense_group_id` non-null + FK.
5. Add `expense_receipt.expense_group_id`; for each receipt row, set it to its expense's new group id; drop `expense_receipt.expense_id`.
6. Make `expense_receipt.expense_group_id` non-null + FK with `ON DELETE cascade` (the ExpenseGroup, not the Expense, now owns the cascade).

One migration, then forever-clean. No lazy backfill, no mixed state.

## Scanner

Receipt scanning is a pluggable backend behind `IReceiptScanner`, selected at boot via env `RECEIPT_SCANNER_BACKEND` exactly like the storage backend (ADR-0012): unset means the feature is off and the scan UI is not rendered; an unknown value fails at boot. Today only an Ollama vision-model backend ships (`OLLAMA_BASE_URL`, default `http://localhost:11434`; `OLLAMA_VISION_MODEL`, required). Future backends (an OCR API) are deferred behind the same interface.

The scanner is **dumb**: `scan(stream, mime) → ScanResult`, receiving only bytes and mime. It knows nothing about the Group, its members, its splits, or its `Category` set — no category guessing, no currency. `ScanResult` is `{ merchant?, date?, totalDecimal?, lineItems: [{ description, amountDecimal }] }`. Amounts are raw decimal strings as printed (the scanner never invents cents or currency decimals); the app normalizes to `amountCents`. `totalDecimal` is the receipt grand total, shown during draft edit as a sanity check only — it is never an Expense, and a sum-of-lines mismatch is flagged but never blocks confirm. Receipts are assumed to be in the Group's selected currency (ADR-0007); foreign-currency receipts are out of scope.

The flow is put-first and draft-then-confirm: upload → `adapter.put` (bytes stored, `storageKey` returned) → `adapter.getStream(key)` feeds the scanner → `ScanResult` returned to the client as a draft (client-held form state, no server draft table, no `ExpenseGroup` row yet) → user edits (payer defaults to the scanning user, splits from `defaultSplitPercent`, amounts/category/description editable) → confirm → create `ExpenseGroup` + child `Expense`s + `ExpenseSplit`s in one transaction, linking the existing `storageKey`. Abandoning the draft orphans the stored bytes, swept by the planned `listKeys()` gc (ADR-0012); a page refresh loses the unsubmitted draft, same as any form. Scanning is a synchronous blocking request for now (single local user, one round-trip, "Scanning…" state); a background-job + poll design is deferred until slow models or large receipts prove it necessary.