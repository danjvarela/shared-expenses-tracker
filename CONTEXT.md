# Shared Expenses Tracker

Splitwise-style shared expense tracker. Users split Expenses within a Group and settle up via Settlements.

## Language

**User**:
A person who can belong to Groups. Created either by invite (added to a Group by email, before ever logging in) or by first Google login. `displayName` and `email` are seeded from the Google profile on first login and are user-editable after.

**Identity**:
The link between a User and an external auth provider account, keyed by (`provider`, `providerSubject`) — `providerSubject` is the provider's stable subject id (e.g. Google's `sub` claim), not email, which can change. Google is the only provider today; the shape allows more later. Login resolves an Identity by (`provider`, `providerSubject`); if none exists, falls back to matching an existing User by email (linking it rather than duplicating); only creates a new User if neither match.
_Avoid_: Account (collides with a future financial-account concept), OAuth account

**Session**:
A server-side record of an authenticated User, referenced by a cookie. Expires independently of the Identity/Google token.

**Group**:
Top-level scope for shared spending. Every Expense and Settlement belongs to exactly one Group — there is no ungrouped expense. Optionally carries `avatarIcon` (a Lucide icon name, purely cosmetic). Also carries `currencyCode`, user-selected at creation and defaulting to pesos — display/formatting only, never used in `PairBalance` or `ExpenseSplit` math, which stay single-currency — see ADR-0007.
_Avoid_: Trip, household (too narrow — a Group is generic)

**GroupMember**:
A User's membership in a Group. Carries no role or permission (no admin/member distinction exists yet). Optionally carries `defaultSplitPercent` — a nullable, per-Group default share used only to prefill new Expense split UIs; not enforced to sum to 100 across a Group's members at the schema level (app layer enforces on save), and independent of any per-`ExpenseGroup` split arrangement default — see ADR-0005.
_Avoid_: Membership, participant

**ExpenseGroup**:
A bundle of one or more Expenses that were created together, scoped to a Group. Every Expense belongs to exactly one ExpenseGroup — there is no batchless Expense (a manually-added single expense is wrapped in its own one-child ExpenseGroup). Carries no defaults of its own; the payer for scanned lines defaults to the scanning user and the split arrangement comes from `GroupMember.defaultSplitPercent`, both applied at draft time. A one-child ExpenseGroup is the normal state of every manual expense and is never labeled or shown as a "group" to the user — see ADR-0013.
_Avoid_: Batch, bundle, receipt group (the origin is not always a receipt), ExpenseGrouping

**Expense**:
A single purchase paid by one User (`paidByUserId`) on behalf of a Group, for a total of `amountCents`, that happened on `date`. Optionally tagged with a Category. Belongs to exactly one ExpenseGroup (`expenseGroupId`, non-null). The only entity that tracks `updatedAt`, since it's expected to be edited after creation. `date` (the purchase date, user-editable) is distinct from `createdAt`/`updatedAt` (audit timestamps) — see ADR-0006.
_Avoid_: Purchase, transaction, bill

**ExpenseSplit**:
One User's exact share (`amountCents`) of an Expense. Stored as its own row per (Expense, User) pair, not embedded in Expense, so balances can be computed with a cross-expense sum. The sum of an Expense's splits is expected to equal the Expense's `amountCents`, but this invariant is not enforced at the schema level — see ADR-0001.
_Avoid_: Share, portion

**ExpenseReceipt**:
An image or PDF attached to one ExpenseGroup, stored via the pluggable storage backend and referenced by an opaque `storageKey`. The source photo for a scanned batch sits on the batch and is shared by all its child Expenses; a manual single expense's receipt sits on that expense's own one-child ExpenseGroup. Immutable — replacing a receipt means deleting and re-adding, so it carries no `updatedAt`. 1:N from ExpenseGroup, cascade-deleted with the ExpenseGroup. See ADR-0012, ADR-0013.
_Avoid_: Receipt (collides with the scan-receipt-to-ExpenseGroup concept), Attachment, Image

**Receipt scan**:
The act of turning receipt bytes into a draft ExpenseGroup: the scanner returns raw line items, the app maps them into child Expenses (payer defaults to the scanning user, splits from `GroupMember.defaultSplitPercent`), the user edits the draft, then confirms to persist. Receipts are assumed to be in the Group's selected currency — foreign-currency receipts are out of scope. The scan UI is not rendered when no scanner backend is configured. See ADR-0013.
_Avoid_: OCR, extraction (implementation detail of a backend, not the domain act)

**Scanner**:
A pluggable backend that turns receipt bytes into a `ScanResult`. Dumb by design: it receives only bytes and mime, knows nothing about the Group, its members, splits, or categories. Selected at boot via env `RECEIPT_SCANNER_BACKEND` (unset = feature off; unknown = boot fail). Today an Ollama vision-model backend and an OCR.space backend ship. See ADR-0013.
_Avoid_: OCR engine, recognizer

**ScanResult**:
The structured output of a Scanner: optional `merchant`, `date`, `totalDecimal` (the receipt grand total, raw decimal — validation display only, never an Expense), and a list of `lineItems` each with a `description` and `amountDecimal` (raw decimal as printed; the app normalizes to `amountCents`). No currency — see `Receipt scan`. See ADR-0013.
_Avoid_: Parsed receipt, extraction result

**PairBalance**:
The cached, directed net debt between two Users within a Group (`fromUserId` owes `toUserId` `amountCents`), incrementally maintained on every Expense/Settlement write rather than summed from ExpenseSplit/Settlement at read time. At most one nonzero row exists per unordered User pair per Group — see ADR-0004.
_Avoid_: Balance (ambiguous between net-per-user and pairwise — this context only has the pairwise shape), debt

**Notification**:
A record telling one User (`userId`, the recipient) that something happened in a Group — an Expense or Settlement was created, or a member was removed. Carries a `type` (`expense_created`, `settlement_created`, `member_removed`), a pre-rendered `message`, an optional `expenseId`/`settlementId` link (whichever the type implies), and a nullable `readAt`. Created as a side effect of the triggering write, never as part of its transaction — see ADR-0008.
_Avoid_: Alert, activity (too broad — this is specifically per-recipient and per-User-scoped)

**Split type**:
How an Expense's total is divided into ExpenseSplits (equal, percentage, by shares, exact). This is a presentation-layer concern only — it must resolve to exact per-user `amountCents` before an ExpenseSplit is created. The domain has no `splitType` field.
_Avoid_: Split method, division strategy

**Settlement**:
A payment of `amountCents` from one User (`fromUserId`) to another (`toUserId`), scoped to a Group, recording a debt being paid down. Does not itself adjust Expense or ExpenseSplit records.
_Avoid_: Payment, payoff

**Category**:
A global, shared label (with an `icon`) for classifying Expenses. Not owned by a Group or User. An Expense's `categoryId` is nullable — uncategorized Expenses are allowed.
_Avoid_: Tag, type

**Money (`amountCents`)**:
An integer, positive-only count of cents, denominated in pesos (see `formatCents`). Used on Expense, ExpenseSplit, and Settlement. No negative amounts, no refund-as-expense.
_Avoid_: amount, price, total (as field names — always suffix `Cents`)
