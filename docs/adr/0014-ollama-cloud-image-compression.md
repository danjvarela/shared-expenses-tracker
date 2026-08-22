# Compress images in the Ollama scanner before the cloud call

Ollama Cloud (our configured `OLLAMA_BASE_URL`) rejects request bodies over ~20MB with HTTP 413 (`request body too large`); a poppler-rasterized PDF at 150 DPI PNG easily exceeds that once base64-encoded (+33%). We resize/re-encode every image to JPEG (long edge ≤1568, quality 80) via an ImageMagick `spawn` inside the Ollama backend before sending, and set `options.num_ctx: 8192` to avoid the sibling failure — silent prompt truncation that returns garbage line items. This is Ollama-backend-internal; the `IReceiptScanner` contract (bytes + mime in, `ScanResult` out) and `CONTEXT.md` are untouched.

## Considered options

- **`sharp` (native npm).** Rejected — prebuilt native binary can rot on NixOS; scan is a cold path so its speed is irrelevant, and ImageMagick is already a `devenv.nix` package used by the adjacent poppler rasterizer.
- **Send raw, no compression.** Rejected — 413 on cloud; pointless anyway since Ollama downsamples images internally per-model (qwen3-vl aligns to multiples of 28, <1M px), so the extra pixels never reach the model.
- **Shared `image-prepare` interface.** Rejected — only the Ollama backend consumes it; an interface would be over-engineering and would leak an impl detail out of the dumb scanner.

## Consequences

- `magick` must be on the runtime PATH (already in `devenv.nix`). A deployment without it fails scan with `ReceiptScannerError`, not a crash.
- 1568px / q80 / `num_ctx` 8192 are constants in `ollama.ts`, not env-tunable — one model, one cloud, YAGNI. Revise here if a second scanner backend or a non-cloud target is added.
- Compression affects only what is sent to Ollama; stored receipt bytes stay original.

> Revised by ADR-0015 (second scanner backend added): the "shared `image-prepare` interface rejected — only one consumer" premise no longer holds — both backends now consume shared `infra/image-prep` and structuring modules, and `IPdfRasterizer` became `IPdfProcessor` (gains `countPages`) in `infra/pdf/`. The constants stance carries forward (OCR.space params are likewise constants in `ocr.ts`); `num_ctx: 8192` remains Ollama-vision-backend-only.
