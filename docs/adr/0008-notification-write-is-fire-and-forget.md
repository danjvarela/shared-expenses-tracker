# Notification insert is fire-and-forget, never blocks the write it's attached to

`Notification` rows are created as a side effect of an Expense or Settlement write (recipient-per-member fan-out), not as part of the domain invariant those writes exist to uphold. A `Notification` insert failing (constraint violation, DB hiccup) must never fail or roll back the Expense/Settlement write it's attached to — the split/balance state is the thing users depend on being correct; a missed notification is a lesser, recoverable failure.

Consequence: any code path that creates Notifications wraps the insert in try/catch, logs on failure, and swallows the error — it never lets a Notification failure propagate into the caller's transaction or response.
