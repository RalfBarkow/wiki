{ pkgs }:

let
  pin = package: version: hash: package.overrideAttrs (_: {
    inherit version;
    nginxVersion = version;
    src = pkgs.fetchurl {
      url = "https://nginx.org/download/nginx-${version}.tar.gz";
      inherit hash;
    };
  });
in
{
  stable = pin pkgs.nginxStable "1.30.7" "sha256-JWW1yDcFDpWPcPsPc8SOK8pFQq00n9NW9G+wxyYQvG4=";
  mainline = pin pkgs.nginxMainline "1.31.9" "sha256-oRxe7uLiV/RHjw5kn4SwBAeH0nfS0+UjOVKqa23LgK0=";
}
