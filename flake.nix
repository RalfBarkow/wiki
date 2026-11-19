{
  description = "Shared FedWiki 0.41.1 and NGINX security packages";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/5e2305d577ca00acbba631b05cb1094d172b29f3";

  outputs = { self, nixpkgs }:
    let
      inherit (nixpkgs) lib;
      forSystems = lib.genAttrs [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
    in
    {
      packages = forSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          wiki = import ./nix/wiki.nix { inherit pkgs; };
        in
        {
          inherit wiki;
          default = wiki;
        }
        // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          nginx = import ./nix/nginx.nix { inherit pkgs; };
        });

      nixosModules.nginx-security = { config, lib, pkgs, ... }:
        let nginx = self.packages.${pkgs.stdenv.hostPlatform.system}.nginx;
        in {
          config = lib.mkIf config.services.nginx.enable {
            services.nginx.package = lib.mkDefault nginx;
            assertions = [{
              assertion = config.services.nginx.package == nginx;
              message = "This security release requires its pinned nginx package. Review any host package override.";
            }];
          };
        };

      checks = lib.genAttrs [ "x86_64-linux" "aarch64-linux" ] (system:
        let
          pkgs = import nixpkgs { inherit system; };
          inherit (self.packages.${system}) wiki nginx;
        in {
          wiki = pkgs.runCommand "check-fedwiki-0.41.1" { } ''
            ${wiki}/bin/wiki --version > "$out"
            grep -F '0.41.1' "$out"
          '';
          nginx = pkgs.runCommand "check-nginx-1.30.7" { } ''
            ${nginx}/bin/nginx -v > "$out" 2>&1
            grep -Fx 'nginx version: nginx/1.30.7' "$out"
          '';
        });
    };
}
