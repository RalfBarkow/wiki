{ pkgs }:

pkgs.nginxStable.overrideAttrs (_: rec {
  version = "1.30.7";
  nginxVersion = version;
  src = pkgs.fetchurl {
    url = "https://nginx.org/download/nginx-${version}.tar.gz";
    hash = "sha256-JWW1yDcFDpWPcPsPc8SOK8pFQq00n9NW9G+wxyYQvG4=";
  };
})
