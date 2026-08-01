# ExpenseSplit is its own entity, not embedded in Expense

Balance calculations need to sum ExpenseSplit amounts across *many* Expenses per User — a cross-expense query. SQLite has no native array/JSON-array column type, so embedding splits as a JSON blob on Expense would force deserializing every Expense row just to compute a balance. We store ExpenseSplit as its own table (`expenseId`, `userId`, `amountCents`) instead.

Consequence: the invariant "sum of an Expense's ExpenseSplit.amountCents === Expense.amountCents" is **not enforced** at the schema/domain level, since the two are validated and persisted independently. Enforcing it is deferred to the future app/service layer (e.g. a transaction that writes both together).
