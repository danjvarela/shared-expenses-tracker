# shared-expenses-tracker

A SvelteKit app for tracking shared expenses within groups: split costs, attach receipts (with OCR scanning), and settle up.

## Developing

Install dependencies, then start a dev server:

```sh
pnpm install
pnpm dev

# or start the server and open the app in a new browser tab
pnpm dev -- --open
```

## Building

To create a production version of the app:

```sh
pnpm build
```

Preview the production build with `pnpm preview`.

## Configuration

Secrets are managed with [secretspec](https://secretspec.dev) (`secretspec.toml`) and wired into the dev shell via `devenv.nix`. Copy `.env.example` to `.env` for a plain non-devenv setup.

### Environment variables

**Core**

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `APP_ENV` | no | `development` | Runtime mode: `development` \| `production`. |
| `LOG_LEVEL` | no | `info` | Logger level: `debug` \| `info` \| `warn` \| `error`. |
| `DATABASE_URL` | yes | — | libSQL/SQLite connection string (Drizzle). |

**Google OAuth**

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | yes (for OAuth login) | — | Google OAuth2 client ID. |
| `GOOGLE_CLIENT_SECRET` | yes (for OAuth login) | — | Google OAuth2 client secret. |

**Ops**

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GC_SECRET` | yes | — | Shared secret authorizing `POST /gc/receipts` and `/gc/avatars`. App fails to boot if unset. |

**Receipt scanning**

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `RECEIPT_SCANNER_BACKEND` | no | disabled | Set to `ocr` to enable receipt scanning. |
| `OCR_API_KEY` | yes if `RECEIPT_SCANNER_BACKEND=ocr` | — | API key for [OCR.space](https://ocr.space/ocrapi). |
| `STRUCTURING_BACKEND` | no | `ollama` | LLM backend that structures OCR text into line items: `ollama` \| `google`. |
| `OLLAMA_TEXT_MODEL` | yes if `STRUCTURING_BACKEND=ollama` | — | Ollama model name. |
| `OLLAMA_BASE_URL` | no | `http://localhost:11434` | Ollama API base URL. |
| `OLLAMA_API_KEY` | no | — | API key for hosted Ollama (e.g. ollama.com). |
| `GOOGLE_API_KEY` | yes if `STRUCTURING_BACKEND=google` | — | API key for Google Gemini. |
| `GEMINI_MODEL` | yes if `STRUCTURING_BACKEND=google` | — | Gemini model name, e.g. `gemini-3.6-flash`. |

**File storage**

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `RECEIPT_STORAGE_BACKEND` | no | `fs` | Storage backend for uploaded receipts. |
| `RECEIPT_STORAGE_FS_DIR` | no | `./uploads` | Directory for receipt files when using the `fs` backend. |
| `AVATAR_STORAGE_BACKEND` | no | `fs` | Storage backend for user avatars. |
| `AVATAR_STORAGE_FS_DIR` | no | `./uploads-avatars` | Directory for avatar files when using the `fs` backend. |

**Build / server**

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `CLOUDFLARE_TUNNEL_HOSTNAME` | no | — | Adds this host to Vite's dev-server `allowedHosts` when running behind a Cloudflare Tunnel. |
| `CLOUDFLARE_TUNNEL_TOKEN` | no | — | Auth token for `cloudflared tunnel run`, used to expose the server publicly. |
| `BUILD_OUT_DIR` | no | `build` | Output directory for the `adapter-node` build. |
| `BODY_SIZE_LIMIT` | no | `512K` | Max request body size (raise for multipart receipt uploads). |
| `PORT` | no | `3000` | Port the built Node server listens on. |

> To deploy the app, you may need to install a different [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
