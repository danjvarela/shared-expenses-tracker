# Expense.date is separate from createdAt/updatedAt

`Expense` gains a `date` field — the purchase date, user-editable, defaulting to today on the add-expense form. `createdAt`/`updatedAt` already carry a specific audit meaning (`createdAt` when the record was inserted, `updatedAt` when last edited — see `CONTEXT.md`), so repurposing either for "when the purchase happened" would conflate audit history with domain data: editing an expense's purchase date would either corrupt `createdAt` (which must stay fixed at insert time) or get silently overwritten by the next edit (if reusing `updatedAt`).

A purchase can be entered well after it happened (backfilling a receipt from last week), so the purchase date and the row's insert time are expected to diverge in normal use, not just as an edge case.

## Considered Options

- Reuse `createdAt` as the purchase date — breaks its audit meaning and can't be edited independently of record history.
- Reuse `updatedAt` — gets clobbered on any unrelated edit (e.g. changing the description), losing the original purchase date.
- New `date` field (chosen) — keeps audit timestamps untouched and lets the purchase date be edited independently.
