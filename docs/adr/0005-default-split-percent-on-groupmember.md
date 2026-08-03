# Default split percentage lives on GroupMember, unenforced, whole-Group edit only

`GroupMember` gains a nullable `defaultSplitPercent`, prefilling the split UI for new Expenses (manual add and `ExpenseGroup` split arrangements) — it does not feed into domain split resolution itself, staying consistent with ADR-0002 (split method is presentation-only). We chose GroupMember over a new entity since it's already the per-Group-per-User join and needs no new lifecycle.

The percentages across a Group's members are not required to sum to 100 at the schema level — mirroring ADR-0001's unenforced ExpenseSplit-sum invariant — but the app layer validates sum-to-100 on save. A member with no `defaultSplitPercent` set (including any newly-joined member) falls back to equal split in the prefill UI, rather than auto-initializing every member's row to an equal share on join; this avoids rewriting every other member's row whenever the Group's membership changes.

Since GroupMember carries no role/permission distinction, editing is all-or-nothing: any member can edit the whole Group's default-split table in one save, rather than each User editing only their own row (which would leave no one able to reconcile the sum-to-100 constraint).
