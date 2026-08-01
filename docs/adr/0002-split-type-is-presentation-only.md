# Split type is a presentation concern, not a domain field

How a User chooses to divide an Expense (equal, percentage, by shares, exact amounts) is a UI decision, not domain state. The domain only stores the resolved result: one ExpenseSplit row per User with an exact `amountCents`. There is no `splitType` enum anywhere in `src/lib/server/domain/`.

This means the app/presentation layer must fully resolve any split method into exact per-user cents (handling rounding remainders) before constructing ExpenseSplit records — the domain has no way to recompute or re-derive a split from a method later.
