# Scan-step correlation via `scanId` in the scan service only; infra loggers uncorrelated

The steps of a single receipt scan are correlated by a `scanId` (`crypto.randomUUID()`) bound to a child logger at `scan()` entry. The child logger (`{ component: 'scan', scanId, groupId, actorUserId }`) is used only inside the scan service; the infra impls it calls — `receipt-normalizer` and the OCR scanner — log on their own loggers, which carry a `component` tag but **no `scanId`**. The scan service bookends each infra call (`normalize starting` / `normalize done`, `scan starting` / `scan done`), so a deep infra log is tied to its scan by the surrounding bookends, not by a shared id.

## Why infra logs don't carry the `scanId`

Threading `scanId` into `IReceiptScanner.scan(stream, mime, ...)` would pollute a deliberately minimal interface — the scanner is domain-dumb by design (ADR-0013: it "knows nothing about the Group, its members, splits, or categories"). A `scanId` is not Group knowledge, but it is a cross-cutting correlation concern, and adding it per-call forces every scanner impl and test to carry it. `AsyncLocalStorage` would propagate it implicitly with no interface change, but the implicit context is invisible at the call site and the mechanism is not justified for a single id. The bookend approach keeps correlation at the orchestration layer, where the scan service already owns the flow, and leaves the scanner interface untouched.

## Trade-off — infra logs need bookends to correlate

A bare `ocr.space request failed` line from `scanner.ocr` has no `scanId`; it is correlated to a scan by the `scan starting` / `scan done` lines the scan service emits around the call. For a personal single-user tracker where scans are sequential, this is trivially readable. It breaks down only under concurrent scans by the same user with interleaved infra failures — an acceptable limit here. If per-receipt tracing of individual OCR/Ollama round-trips ever becomes a hard need, the upgrade path is `AsyncLocalStorage` set at `scan()` entry and read by the infra loggers, with no interface change.

## Consequences

- `scanId` appears only on scan-service log lines; infra log lines show only `component`.
- The scan service is the single place that knows a scan is in progress; infra stays stateless and correlation-free.
- `confirmDraft` is a separate request and does **not** carry a `scanId` — it logs `storageKey` instead, which is the handle that ties a confirm to the already-stored scanned artifact (see ADR-0013's put-first flow).