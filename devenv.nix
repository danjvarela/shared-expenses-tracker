{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:

{
  packages = [ pkgs.playwright-driver.browsers ];

  env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
  env.PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";

  env.DATABASE_URL = config.secretspec.secrets.DATABASE_URL or "";
  env.GOOGLE_CLIENT_ID = config.secretspec.secrets.GOOGLE_CLIENT_ID or "";
  env.GOOGLE_CLIENT_SECRET = config.secretspec.secrets.GOOGLE_CLIENT_SECRET or "";
}
