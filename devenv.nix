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
  ];

  env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
  env.PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";

  env.DATABASE_URL = config.secretspec.secrets.DATABASE_URL or "";
  env.GOOGLE_CLIENT_ID = config.secretspec.secrets.GOOGLE_CLIENT_ID or "";
  env.GOOGLE_CLIENT_SECRET = config.secretspec.secrets.GOOGLE_CLIENT_SECRET or "";

  env.RECEIPT_SCANNER_BACKEND = "ocr";
  env.OLLAMA_API_KEY = config.secretspec.secrets.OLLAMA_API_KEY or "";
  env.OLLAMA_BASE_URL = "https://ollama.com";
  env.OLLAMA_VISION_MODEL = "qwen3.5:397b-cloud";
  env.OLLAMA_TEXT_MODEL = "qwen3.5:397b-cloud";
  env.RUN_SCANNER_INTEGRATION = "0";
  
  env.OCR_API_KEY = config.secretspec.secrets.OCR_API_KEY or "";
}
