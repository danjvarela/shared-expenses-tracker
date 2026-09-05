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
  env.OLLAMA_TEXT_MODEL = "qwen3.5:397b-cloud";

  env.OCR_API_KEY = config.secretspec.secrets.OCR_API_KEY or "";

  env.GC_SECRET = config.secretspec.secrets.GC_SECRET or "";

  profiles.development.module = {
    env.RECEIPT_STORAGE_BACKEND = "fs";
    env.RECEIPT_STORAGE_FS_DIR = "./uploads";

    processes.dev.exec = "pnpm dev";
  };

  profiles.production.module = {
    env.RECEIPT_STORAGE_BACKEND = "fs";
    env.RECEIPT_STORAGE_FS_DIR = "REDACTED_RECEIPT_DIR";
    env.CLOUDFLARE_TUNNEL_HOSTNAME = "redacted.example.com";
    env.CLOUDFLARE_TUNNEL_TOKEN = config.secretspec.secrets.CLOUDFLARE_TUNNEL_TOKEN or "";
    env.PORT = "5173";

    processes.dev.exec = "pnpm build && node build";
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
