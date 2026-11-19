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
      nginxModule = output: { config, lib, pkgs, ... }:
        let nginx = self.packages.${pkgs.stdenv.hostPlatform.system}.${output};
        in {
          services.nginx.package = lib.mkDefault nginx;
          assertions = [{
            assertion = config.services.nginx.enable && config.services.nginx.package == nginx;
            message = "Enable NGINX and select the pinned NGINX ${nginx.version} package for this server.";
          }];
        };
    in
    {
      packages = forSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          wiki = import ./nix/wiki.nix { inherit pkgs; };
          nginx = import ./nix/nginx.nix { inherit pkgs; };
        in
        {
          inherit wiki;
          default = wiki;
        }
        // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          nginx = nginx.mainline;
          nginx-mainline = nginx.mainline;
          nginx-stable = nginx.stable;
        });

      nixosModules = {
        nginx-security = nginxModule "nginx-mainline";
        nginx-mainline = nginxModule "nginx-mainline";
        nginx-stable = nginxModule "nginx-stable";
      };

      checks = lib.genAttrs [ "x86_64-linux" "aarch64-linux" ] (system:
        let
          pkgs = import nixpkgs { inherit system; };
          inherit (self.packages.${system}) wiki nginx-mainline nginx-stable;
          checkNginx = variant: version:
            pkgs.runCommand "check-nginx-${version}" { } ''
              ${variant}/bin/nginx -v > "$out" 2>&1
              grep -Fx 'nginx version: nginx/${version}' "$out"
            '';
        in {
          wiki = pkgs.runCommand "check-fedwiki-0.41.1" { } ''
            ${wiki}/bin/wiki --version > "$out"
            grep -F '0.41.1' "$out"
          '';
          nginx-mainline = checkNginx nginx-mainline "1.31.9";
          nginx-stable = checkNginx nginx-stable "1.30.7";
        });
    };
}
