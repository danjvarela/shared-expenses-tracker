# Roadmap

Status tags: `Done`, `In progress`, `Not started`, `Flagged` (design undecided, see Open questions).

## Groups

- [x] Done — Group creation (name, optional `avatarIcon`, user-selected `currencyCode` display-only — see ADR-0007). Solo creation only, creator becomes sole member.
- [x] Done — Update group detail (name, currencyCode, avatarIcon). Any member may edit. App-wide membership guard added for `groups/[id]/*` routes as part of this work.
- [ ] Not started — Delete group (blocked while any nonzero `PairBalance` exists in the group; hard delete, cascades Expenses/Settlements/PairBalances once clear)
- [ ] Not started — Invite user to group by email (domain already supports pre-login Users via `Identity` fallback-by-email match; UI/flow not built)
- [x] Done — Set default split percentages per member (`GroupMember.defaultSplitPercent`, prefill-only, unenforced sum — see ADR-0005). Schema, service, whole-group settings UI, and prefill into the expense-add split UI all done.
- [ ] Not started — Kick user from group (blocked while that member has any nonzero `PairBalance` in the group)
- [x] Done — View a group's members/expenses/balances (read-only)

## Expenses

- [x] Done — View a group's expenses (read-only list)
- [x] Done — Add expense manually (form)
- [ ] Not started — Add expense via free-text input (AI-generated fields)
- [ ] Not started — Scan receipt to add multiple expenses (OCR/AI)
- [ ] Not started — `ExpenseGroup` entity — new domain concept, needs a `CONTEXT.md` entry + ADR before/while building:
  - Every `Expense.expenseGroupId` is non-null (manual single-add creates a group of one too — no nullable special case)
  - `ExpenseGroup` supplies *defaults only* (payer, split arrangement), copied down into each child `Expense`/`ExpenseSplit` at creation time
  - Each child is a plain, full `Expense` — own category, own payer, own splits, independently editable after creation (no live inheritance)
  - UI collapses an `ExpenseGroup`'s children into one row so a 30-item receipt doesn't flood the expense list
- [ ] Not started — Update expense
- [ ] Not started — Delete expense
- [ ] Not started — Duplicate expense (duplicates a single `Expense` + its splits, not the whole `ExpenseGroup`)
- [ ] Not started — Settlement recording UI (domain model already exists, no UI)

## Account settings

- [ ] Not started — Change display name
- [ ] Not started — Update profile picture

## Receipts

- [ ] Flagged — Receipt image storage: pluggable backend selected via config/env (e.g. Cloudflare R2 for a published deployment, Google Drive for personal use). Needs a storage adapter interface before backend choice is locked in.

## Additional suggested features

- [ ] Not started — Expense comments/notes (free-text per expense, beyond category)
- [ ] Not started — Activity/audit log per group (who added/edited/deleted what, when)
- [ ] Not started — Notifications (push/email on new expense, invite, settlement)
- [ ] Not started — Recurring expenses (auto-create on a schedule, e.g. monthly rent)
- [ ] Not started — Export group data (CSV/PDF of expenses and balances)
- [ ] Not started — Multi-group dashboard (cross-group total owed / owed-to-you)

## Open questions

- **Receipt image storage backend**: which backends to actually support (R2, Google Drive, others), and the shape of the adapter interface selecting between them via env/flag.
