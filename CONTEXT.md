# Shared Expenses Tracker

Splitwise-style shared expense tracker. Users split Expenses within a Group and settle up via Settlements.

## Language

**Group**:
Top-level scope for shared spending. Every Expense and Settlement belongs to exactly one Group — there is no ungrouped expense.
_Avoid_: Trip, household (too narrow — a Group is generic)

**GroupMember**:
A User's membership in a Group. Plain join — carries no role or permission (no admin/member distinction exists yet).
_Avoid_: Membership, participant

**Expense**:
A single purchase paid by one User (`paidByUserId`) on behalf of a Group, for a total of `amountCents`. Optionally tagged with a Category. The only entity that tracks `updatedAt`, since it's expected to be edited after creation.
_Avoid_: Purchase, transaction, bill

**ExpenseSplit**:
One User's exact share (`amountCents`) of an Expense. Stored as its own row per (Expense, User) pair, not embedded in Expense, so balances can be computed with a cross-expense sum. The sum of an Expense's splits is expected to equal the Expense's `amountCents`, but this invariant is not enforced at the schema level — see ADR-0001.
_Avoid_: Share, portion

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
