# Logs carry no receipt contents or usernames

Server logs contain only opaque ids, counts, sizes, mime types, durations, and amounts. They never carry receipt free text — no line-item descriptions, no merchant, no user-uploaded filenames — and never carry usernames or emails. Money is logged as integer `amountCents` (debug-relevant, not free text), and people are referenced only by opaque user ids.

## Why no receipt contents

Receipt text is the user's financial detail: what they bought, where, and for how much. The logs exist for debugging the scan→confirm pipeline (is the receipt being normalized? did OCR run? are we confirming an already-scanned draft?), and that debugging needs the *shape* of the flow — which step ran, how long it took, how many line items came back, the normalized size and mime — not the *content* of the receipt. A line count and a duration are enough to see a scan progress; the merchant name or a line description would be debug- convenient but leak exactly the data the tracker has no reason to put in a log file.

## Trade-off — debuggability

The one genuinely debug-useful field this gives up is `merchant`: seeing the extracted merchant next to `scan done` would make OCR-structuring quality trivially eyeballable in the terminal. It is excluded anyway to keep the policy a bright line — "no receipt contents" is enforceable as a single rule, "no receipt contents except merchant" is a rule with an exception that erodes. The `scan.test.ts` recording-logger assertion (ADR-0017) enforces this: it asserts that no `description`, `merchant`, or `filename` field ever appears on the scan step events, so a future edit that re-adds one fails the suite.

## What is and isn't logged

- **Logged:** `scanId`, `groupId`, `actorUserId`/`paidByUserId` (opaque ids), `storageKey`, `expenseId`/`expenseGroupId`, `sizeBytes`, `mime`, `lineItems` (count), `amountCents`, `durationMs`, `component`.
- **Not logged:** `description`, `merchant`, `filename`/`originalFilename`, `displayName`, `email`, OCR `ParsedText`, Ollama response `content`.

## Consequences

- Logs are safe to tail, share, and persist without redaction in a personal context.
- Debugging OCR quality requires re-running a scan, not reading a log — accepted.
- The policy is enforced in tests, not only by convention.