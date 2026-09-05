# Injected `ILogger` over a module-level singleton logger

Server logging goes through an `ILogger` interface owned by the app layer, with a console-based implementation in infra, wired into every service and infra impl by `container.ts`. Services receive a logger in their dependency bags; infra impls receive one as a constructor argument — the same injection shape as `IReceiptScanner`, `IReceiptNormalizer`, and the repositories. This replaces the 23 bare `console.*` calls that were scattered across both layers, including inside app services (`expense`, `settlement`, `receipt`, `receipt-gc`, `remove-member`) that otherwise kept infra out of the app layer.

## Why inject, when `console.*` was already in the app layer

The codebase pays the injection tax for every other cross-cutting dependency precisely to keep the app layer free of infra and unit-testable with fakes. Logging was the one place it cheated — `console.error` is a global, so it slipped in without an import, but it is still an infra concern (a specific output transport) leaking into app. A dedicated logger is the point to pay that debt back rather than double down: a module singleton would have replaced `console.*` one-for-one with no constructor churn, but it would freeze the app→infra leak and make the logging unverifiable in tests.

## Trade-off — constructor churn

Threading `logger` through ~13 factories and their dep types is mechanical but wide-reaching. To keep test churn bounded, every factory defaults `logger` to a `NOOP_LOGGER` (exported from the interface module, so no app→infra import) when omitted; `container.ts` always supplies a real logger in production. Tests that don't care about logs stay unchanged; tests that assert on logs pass a recording logger.

## Considered options

- **Module singleton** (`infra/logger.ts` imported directly) — rejected: re-introduces the app→infra dependency the architecture forbids elsewhere, and a singleton can't be swapped for a capturing fake per test.
- **`AsyncLocalStorage`-based contextual logger** — rejected for the app-wide logger: implicit context invisible at the call site, not justified when the only per-operation context needed is a `scanId` (see ADR-0018).

## Consequences

- One logging surface app-wide; no `console.*` remains in `src/lib/server`.
- App services are logger-pure: they depend on `ILogger`, never on `console` or an infra module.
- A recording logger in tests can assert which events fired and with what fields — this is what enforces the no-receipt-contents policy (ADR-0019) in the suite.
- Output format (human-pretty text, `LOG_LEVEL` env) is an infra detail, not part of the interface; reversible without touching app.