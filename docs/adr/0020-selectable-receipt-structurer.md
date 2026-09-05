# Selectable receipt structuring LLM (Ollama | Google AI)

The OCR scanner backend (ADR-0015, collapsed to a single backend by ADR-0016) is a composition: OCR.space extracts text, then an LLM structures that text into a `ScanResult`. The structuring step is now pluggable at boot between Ollama (the existing text model) and Google AI (Gemini), so the two can be compared on performance and quality by swapping one env var and re-scanning. OCR.space stays the fixed text-extraction stage; only the text→`ScanResult` call is swappable.

## Why an interface now, after ADR-0015 rejected one

ADR-0015 rejected a shared `IReceiptTextParser` interface on the grounds of a single consumer — only the OCR backend parsed text, so an interface would over-engineer one call site. ADR-0016 then collapsed the two scanner backends into one, leaving the structuring call with exactly one consumer. This ticket adds a second structurer (Google), which is the real reason to introduce the interface after all: two impls behind one contract, selected at boot. The premise of ADR-0015's rejection (one consumer) no longer holds; this ADR revises it.

The interface is `IReceiptStructurer.structure(parsedText: string): Promise<ScanResult>`, infra-internal — it lives in `infra/receipt-scanner/structurer.ts`, **not** in `app/interfaces/`. `CONTEXT.md` is unchanged: "Structurer" stays an implementation detail, matching ADR-0015's stance and the existing `_Avoid_: extraction` line on the `Receipt scan` / `Scanner` terms. The scanner contract (`IReceiptScanner.scan(stream, mime)`) is untouched; the structurer is a private collaborator of the OCR backend, invisible to the app layer.

## Each impl owns its prompt framing, schema format, and JSON extraction

`STRUCTURING_RULES` (the document-type rules, modality-agnostic) and `normalize` (raw payload → `ScanResult`) stay shared in `structuring.ts` — both impls map through the same `normalize`. Everything else is impl-owned: `RESPONSE_FORMAT` and `extractJson` move to the Ollama impl (`structurers/ollama.ts`), since Gemini does not need Ollama's fenced-code-block JSON extraction (it returns raw JSON via `responseMimeType: application/json` + a `responseSchema`). Each impl owns its own prompt framing (the field-description text that wraps `STRUCTURING_RULES`) and its own schema format (Ollama's `format` JSON schema vs Gemini's `Type`-enum `responseSchema`).

**Trade-off — duplicated prompt text:** the field-description prose ("Return JSON with these fields: …") is duplicated between the two impls rather than shared. This is deliberate: "each impl owns its prompt framing" is the decision, and the two framing styles may legitimately diverge (Gemini's schema already declares the shape, so its prose may shrink later). A shared prompt module would re-couple the impls the interface was introduced to decouple.

## Selection at boot; comparison is manual via UI + logs

`STRUCTURING_BACKEND` env selects the structurer: `ollama` (default when unset — zero-config backward compat) or `google`. Unknown value → `ReceiptScannerConfigError` at boot. It is only resolved when `RECEIPT_SCANNER_BACKEND=ocr`; when the scanner is off, `STRUCTURING_BACKEND` is ignored silently (no validation, no boot fail). `GEMINI_MODEL` and `GOOGLE_API_KEY` are required when `STRUCTURING_BACKEND=google`; `GEMINI_MODEL` has no default.

There is no runtime dual-run harness and no fixture-driven comparison script. The two structurers are compared by swapping `STRUCTURING_BACKEND`, re-uploading via the scan UI, and reading the `durationMs` logs each structurer emits (`ollama structuring request`/`response` and `google structuring request`/`response`, mirroring each other). A runtime A/B harness and a fixture comparison were considered and rejected as out of scope: the goal is a swappable second impl, not an automated benchmark.

## Google access via `@google/genai`; SDK client injected

The Google structurer uses the `@google/genai` SDK with structured output (`responseMimeType: 'application/json'` + a `responseSchema` mirroring `RESPONSE_FORMAT`). The SDK client is injected into the structurer factory, parallel to the Ollama structurer's `fetch`-injection pattern — so the structurer test stubs the client without touching the network. `createReceiptScannerBackend` constructs the real `GoogleGenAI` client for the `google` branch and wires the chosen structurer into the OCR scanner; `ocr.ts` no longer makes the structuring call itself, it delegates `parsedText` to the injected structurer. A Google SDK failure or non-JSON response throws `ReceiptScannerError`, the same shape as the Ollama path.

The structurer log lines carry a `component` tag (`structurer.ollama` / `structurer.google`) and no `scanId` — ADR-0018 holds (correlation stays in the scan service via bookends; infra loggers remain uncorrelated). They log only `model` and `durationMs` — ADR-0019 holds (no receipt contents; the recording-logger assertion in `scan.test.ts` is unchanged because it operates at the scan-service layer with a stub scanner).

## Consequences

- `IReceiptStructurer` exists in `infra/receipt-scanner/structurer.ts` (infra-internal); `CONTEXT.md` is unchanged.
- `structuring.ts` keeps only `STRUCTURING_RULES` + `normalize`; `RESPONSE_FORMAT` + `extractJson` relocate to `structurers/ollama.ts`.
- `structurers/google.ts` ships, `@google/genai` installed; SDK client injected, structured output via Gemini schema, maps through shared `normalize`.
- `ocr.ts` is OCR.space-only and delegates to the injected structurer; `index.ts` `ScannerConfig` gains a `structurer` discriminated union and wires the chosen impl, constructing the real `GoogleGenAI` for the `google` branch.
- New env: `STRUCTURING_BACKEND` (default `ollama`), `GOOGLE_API_KEY`, `GEMINI_MODEL` (required only when `STRUCTURING_BACKEND=google`).
- Revises ADR-0015 (the "single consumer, no structuring interface" premise is reversed — a second structurer now exists).
