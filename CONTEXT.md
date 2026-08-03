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
Top-level scope for shared spending. Every Expense and Settlement belongs to exactly one Group — there is no ungrouped expense.
_Avoid_: Trip, household (too narrow — a Group is generic)

**GroupMember**:
A User's membership in a Group. Carries no role or permission (no admin/member distinction exists yet). Optionally carries `defaultSplitPercent` — a nullable, per-Group default share used only to prefill new Expense split UIs; not enforced to sum to 100 across a Group's members at the schema level (app layer enforces on save), and independent of any per-`ExpenseGroup` split arrangement default — see ADR-0005.
_Avoid_: Membership, participant

**Expense**:
A single purchase paid by one User (`paidByUserId`) on behalf of a Group, for a total of `amountCents`. Optionally tagged with a Category. The only entity that tracks `updatedAt`, since it's expected to be edited after creation.
_Avoid_: Purchase, transaction, bill

**ExpenseSplit**:
One User's exact share (`amountCents`) of an Expense. Stored as its own row per (Expense, User) pair, not embedded in Expense, so balances can be computed with a cross-expense sum. The sum of an Expense's splits is expected to equal the Expense's `amountCents`, but this invariant is not enforced at the schema level — see ADR-0001.
_Avoid_: Share, portion

**PairBalance**:
The cached, directed net debt between two Users within a Group (`fromUserId` owes `toUserId` `amountCents`), incrementally maintained on every Expense/Settlement write rather than summed from ExpenseSplit/Settlement at read time. At most one nonzero row exists per unordered User pair per Group — see ADR-0004.
_Avoid_: Balance (ambiguous between net-per-user and pairwise — this context only has the pairwise shape), debt

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
