{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:

{
  packages = [
    pkgs.playwright-driver.browsers
    pkgs.imagemagick
    pkgs.poppler-utils
    pkgs.ghostscript
    pkgs.cloudflared
  ];

  env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
  env.PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";

  env.DATABASE_URL = config.secretspec.secrets.DATABASE_URL or "";
  env.GOOGLE_CLIENT_ID = config.secretspec.secrets.GOOGLE_CLIENT_ID or "";
  env.GOOGLE_CLIENT_SECRET = config.secretspec.secrets.GOOGLE_CLIENT_SECRET or "";

  env.RECEIPT_SCANNER_BACKEND = "ocr";
  env.OLLAMA_API_KEY = config.secretspec.secrets.OLLAMA_API_KEY or "";
  env.OLLAMA_BASE_URL = "https://ollama.com";
  env.OLLAMA_TEXT_MODEL = "glm-5.2";

  env.OCR_API_KEY = config.secretspec.secrets.OCR_API_KEY or "";

  # Structuring stage defaults to ollama (above). To compare Google AI / Gemini,
  # set STRUCTURING_BACKEND=google and provide the two values below (no defaults).
  env.STRUCTURING_BACKEND = "google";
  env.GOOGLE_API_KEY = config.secretspec.secrets.GOOGLE_API_KEY or "";
  env.GEMINI_MODEL = "gemini-3.6-flash";

  env.GC_SECRET = config.secretspec.secrets.GC_SECRET or "";

  # Match adapter-node's BODY_SIZE_LIMIT to MAX_RECEIPT_BYTES (10 MiB) plus
  # multipart/form-data framing overhead, so receipt uploads aren't rejected
  # with 413 before request.formData() runs. Default is 512K.
  env.BODY_SIZE_LIMIT = "12M";

  profiles.development.module = {
    env.RECEIPT_STORAGE_BACKEND = "fs";
    env.RECEIPT_STORAGE_FS_DIR = "./uploads";

    processes.dev.exec = "pnpm dev";
  };

  profiles.demo.module = {
    env.APP_ENV = "demo";
    env.DATABASE_URL = config.secretspec.secrets.DEMO_DATABASE_URL or "file:demo.db";
    env.DEMO_DATABASE_URL = config.secretspec.secrets.DEMO_DATABASE_URL or "file:demo.db";

    # No receipt-scanner backend configured for demo: leave RECEIPT_SCANNER_BACKEND
    # unset so the scanner stays disabled (see resolveScannerConfig's "off" path)
    # instead of requiring a Gemini/OCR/Ollama key to boot.
    env.RECEIPT_SCANNER_BACKEND = "";
    env.OLLAMA_API_KEY = "";
    env.OCR_API_KEY = "";
    env.GOOGLE_API_KEY = "";

    env.RECEIPT_STORAGE_BACKEND = "fs";
    env.RECEIPT_STORAGE_FS_DIR = "./uploads-demo";

    processes.dev.exec = "pnpm build && node build";
  };

  profiles.production.module = {
    env.RECEIPT_STORAGE_BACKEND = "fs";
    env.RECEIPT_STORAGE_FS_DIR = config.secretspec.secrets.RECEIPT_STORAGE_FS_DIR or "./uploads-prod";
    env.CLOUDFLARE_TUNNEL_HOSTNAME = config.secretspec.secrets.CLOUDFLARE_TUNNEL_HOSTNAME or "";
    env.CLOUDFLARE_TUNNEL_TOKEN = config.secretspec.secrets.CLOUDFLARE_TUNNEL_TOKEN or "";
    env.PORT = "5173";

    env.BUILD_OUT_DIR = "build-prod";

    processes.dev.exec = "pnpm build && node build-prod";
    processes.dev.ready = {
      http.get = {
        port = 5173;
        path = "/";
      };
    };

    processes.tunnel.exec = ''
      if [ -z "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
        echo "CLOUDFLARE_TUNNEL_TOKEN not set, skipping cloudflared tunnel"
        exit 0
      fi
      cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN"
    '';
    processes.tunnel.after = [ "devenv:processes:dev" ];
  };
}
