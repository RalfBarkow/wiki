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
  stable = pin pkgs.nginxStable "1.30.8" "sha256-+GcxStoy5xe5SZMIWWVsSKctxmV67FmNtYry+YpA4cE=";
  mainline = pin pkgs.nginxMainline "1.31.10" "sha256-qbaQlX/KhKva6Km1LWaxu0WSgtfwH+S5S0mO2Ol3vbM=";
}
