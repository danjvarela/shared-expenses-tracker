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
}
