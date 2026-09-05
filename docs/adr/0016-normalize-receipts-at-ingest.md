# Normalize every receipt to JPEG/PDF at ingest; drop the Ollama vision backend

All uploaded receipts are transcoded to a single stored format at ingest — images to JPEG (ImageMagick resize ≤1568px, q80), PDFs to a ghostscript `/ebook`-compressed PDF — and the original bytes are not retained. The Ollama *vision* scanner backend is removed; the only scanner is the OCR.backend (ADR-0015), which now sends the already-normalized stored bytes straight to OCR.space with no scanner-side `prepareImage`. This reverses ADR-0014's "stored bytes stay original" and collapses ADR-0015's "two backends share image-prep" premise. The goal is HEIC support plus a uniform, browser-renderable stored artifact.

## Why normalize at ingest, not on read

The storage allow-list already advertised `image/heic` (and avif, webp), but a stored HEIC is un-viewable in every non-Safari browser — `getReadAccess` serves the original bytes with the original mime, so an upload "succeeded" and then rendered as a broken image. Meanwhile the scan flow blocked HEIC entirely via a magic-byte sniff that only knew PDF/PNG/JPEG. Normalizing at ingest kills both problems with one mechanism: the stored artifact is always `image/jpeg` or `application/pdf`, both universally renderable, and the scanner receives a known-good format. The alternative — keep heterogeneous originals, rasterize-on-read for the viewer and re-compress for the scanner — preserves evidence but pays a transform on every access and leaves storage non-uniform; rejected because the whole point was a single stored format.

**Trade-off — evidence integrity:** the production storage directory is `proof-of-transactions`, and these receipts are financial evidence. A lossy re-encode mutates the document the user uploaded, and the original is discarded. For a personal shared-expenses tracker this is accepted: not audit-grade. If evidence integrity becomes a hard requirement, this ADR is the decision to revisit (the alternative is keep-original + derive-on-read, which does not produce a single stored format).

**Trade-off — always compress, no pass-through:** even an already-JPEG upload is re-encoded through `magick`. This is deliberate (uniform storage, bounded size) over losslessness; JPEG generation loss is the accepted cost. A pass-through for already-JPEG was considered and rejected — it optimizes the common case at the price of two storage shapes and a conditional the constants-stance (ADR-0014) argues against.

## Detection unified; client mime no longer trusted

`sniffMime` is extended to the full sniffed set {pdf, jpeg, png, webp, heic, heif, avif} via magic bytes (`ftyp` brands for HEIC/HEIF/AVIF, `RIFF….WEBP` for WebP) and is now used on **both** upload surfaces. The manual-upload route previously trusted the browser's `file.type` against `ALLOWED_RECEIPT_MIMES`; it now sniffs like the scan route does. One sniffed allowed-list, one source of truth; a client can no longer lie about content type. The stored `mime` is the **normalized** format (`image/jpeg` or `application/pdf`), never the original; the original format survives only in `originalFilename`'s extension.

## `prepareImage` leaves the scanner; Ollama vision backend removed

`RECEIPT_SCANNER_BACKEND=ocr` in every profile — the Ollama vision backend (`infra/receipt-scanner/ollama.ts`, selected by `backend: 'ollama'`, `OLLAMA_VISION_MODEL`) was already unused in production. It is deleted outright; `ScannerConfig` collapses to `off | ocr`. With only the OCR backend left:

- The OCR backend's image branch received already-normalized stored JPEG, so its `prepareImage` call is redundant and is removed — it sends stored bytes straight to OCR.space. Its PDF branch already sent raw PDFs to OCR.space (ADR-0015: OCR.space accepts PDFs natively, rasterizing is wasted work), so no `prepareImage` was ever in the PDF path.
- `infra/image-prep`'s `prepareImage` therefore has zero scanner consumers. Its single consumer becomes the **ingest normalize step** — back to ADR-0014's original "one consumer" shape, but the consumer moved from the scanner to ingest. The module is reused, not re-interfaced (the constants-stance carries: 1568/q80 stay in `image-prep`, `/ebook` stays with the gs path).

The OCR backend's Ollama **text**-model structuring call is untouched — OCR.space extracts text, Ollama text models it into `ScanResult` (ADR-0015's composition stands; only the vision sibling is gone).

## PDF compression adds ghostscript; new limit surface is OCR.space

PDFs are compressed at ingest via `gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook` (150 dpi), added as a `compress` operation on `IPdfProcessor` alongside poppler's `countPages`/`rasterizeFirstPage`. This adds `pkgs.ghostscript` to `devenv.nix` (present in the production profile too). ImageMagick's HEIC/HEIF/AVIF read+write delegate is already in the nix env, so no new image dependency.

Removing the Ollama vision backend removes ADR-0014's motivating constraint — the ~20 MB Ollama Cloud request-body limit. The new limit surface is OCR.space's per-request size cap. A normalized ≤1568px JPEG q80 is typically well under 1 MB, but a dense photo can brush the free-tier 1 MB cap; this is watched via OCR.space error responses, not pre-emptively re-sized (ingest already bounded it once).

## Consequences

- Stored receipts are always `image/jpeg` or `application/pdf`, browser-renderable, size-bounded. HEIC/AVIF/WebP/PNG scan and store correctly; the latent HEIC-viewability bug is gone.
- Original upload bytes are not recoverable; the `mime`/`sizeBytes` columns describe the normalized artifact, not the upload.
- No migration and no seed change: there is no production data, and the seed script creates no receipts.
- `image-prep`'s sole consumer is ingest; the OCR backend no longer takes a `spawn`/`SpawnFn` option.
- Revises ADR-0014 (stored bytes are now normalized, not original; scanner-side compression for the cloud limit is gone) and ADR-0015 (one backend, not two; image-prep's consumer is ingest, not the scanners).