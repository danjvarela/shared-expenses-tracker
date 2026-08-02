# PairBalance is an incrementally-maintained cache, not a query-time sum

Computing a Group's balances by summing Expense/ExpenseSplit/Settlement on every read doesn't scale with Expense count, and pairwise (not net-per-user) balances are the required shape since Settlement is already directed per-pair. We introduce `pair_balance` (`groupId`, `fromUserId`, `toUserId`, `amountCents`), updated incrementally in the same transaction as any Expense or Settlement write, instead of recomputed from source rows at read time.

Invariant: at most one nonzero row exists per unordered User pair per Group. Every write recomputes the pair's net and replaces both directional rows with a single upsert (or none, if net is exactly zero) — there is no state where both directions hold a nonzero value simultaneously.

Consequence: `pair_balance` is a derived cache; ExpenseSplit/Expense/Settlement remain the source of truth. `recomputeGroupBalances(groupId)` recomputes it from scratch and doubles as both the drift-repair path and the test oracle the incremental path is checked against.
