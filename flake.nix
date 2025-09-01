{
  description = "fedwiki/wiki packaged from this checkout via buildNpmPackage";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" ] (system:
      let
        pkgs = import nixpkgs { inherit system; };
        lib = pkgs.lib;
      in {
        packages = {
          # Build the wiki CLI from the CURRENT CHECKOUT. To get a 0.38.3 output path,
          # check out the tag before building: `git checkout v0.38.3`.
          #
          # First build will fail with an npmDepsHash mismatch and tell you the correct hash.
          # Replace npmDepsHash with the suggested one, then build again.
          wiki = pkgs.buildNpmPackage {
            pname = "wiki";
            # Keep the version in sync with package.json of main head
            version = (lib.importJSON ./package.json).version;
            src = ./.;                     # build from this working tree

            # Set the Node you want at build & runtime (adjust if upstream requires newer):
            nodejs = pkgs.nodejs_22;       # adjust if upstream requires a specific Node (try 22 first, else 20)

            # Filled on second run with the value Nix suggests.
            # Temporary placeholder to trigger hint:
            # First build will fail and print the correct hash; paste it here in base64 format.
            npmDepsHash = "sha256-L8TSlbmK5H7tl8Zyj0Vp1Xibi9l7subaeNO8PfQnJMs=";  # replace after first build

            # We only need production dependencies for the CLI runtime.
            # Production install only (npm >=9 prefers --omit=dev)
            npmFlags = [ "--omit=dev" ];

            # Upstream has no build step; skip the build phase entirely
            dontNpmBuild = true;

            # The npm package exposes a `bin` named `wiki`; buildNpmPackage wires $out/bin/wiki.
            meta = {
              description = "Federated Wiki command-line server";
              homepage = "https://github.com/fedwiki/wiki";
              mainProgram = "wiki";
              license = lib.licenses.mit;  # adjust if different
              platforms = lib.platforms.linux;
            };
          };
        };

        # `nix build` will produce `./result -> /nix/store/<hash>-wiki-0.38.3` (after you fix npmDepsHash).
        defaultPackage = self.packages.${system}.wiki;

        # `nix run` will execute the CLI directly.
        apps.wiki = {
          type = "app";
          program = lib.getExe self.packages.${system}.wiki;
        };
        defaultApp = self.apps.${system}.wiki;

        # Nice dev shell for hacking locally (installs Node, npm, corepack, jq).
        devShells.default = pkgs.mkShell {
          packages = [ pkgs.nodejs_20 pkgs.nodePackages.npm pkgs.corepack pkgs.jq ];
        };

        # Optional NixOS module to run wiki as a service behind nginx.
        nixosModules.fedwiki = { config, lib, pkgs, ... }: let cfg = config.services.fedwiki; in {
          options.services.fedwiki = {
            enable = lib.mkEnableOption "Federated Wiki server";
            package = lib.mkOption {
              type = lib.types.package;
              default = self.packages.${system}.wiki;
              description = "Wiki package to run";
            };
            user = lib.mkOption { type = lib.types.str; default = "fedwiki"; };
            group = lib.mkOption { type = lib.types.str; default = "fedwiki"; };
            port = lib.mkOption { type = lib.types.port; default = 3000; };
            configFile = lib.mkOption {
              type = lib.types.path;
              example = "/var/lib/fedwiki/config.json";
              description = "Path to wiki config.json";
            };
            hostName = lib.mkOption {
              type = lib.types.nullOr lib.types.str;
              default = null;
              description = "If set, create an nginx vhost for this host name";
            };
          };
          config = lib.mkIf cfg.enable {
            users.users.${cfg.user} = {
              isSystemUser = true;
              group = cfg.group;
              home = "/var/lib/fedwiki";
              createHome = true;
            };
            users.groups.${cfg.group} = {};

            systemd.services.fedwiki = {
              description = "Federated Wiki";
              after = [ "network-online.target" ];
              wantedBy = [ "multi-user.target" ];
              serviceConfig = {
                ExecStart = ''${cfg.package}/bin/wiki --config ${cfg.configFile} --port ${toString cfg.port}'';
                WorkingDirectory = "/var/lib/fedwiki";
                User = cfg.user;
                Group = cfg.group;
                Restart = "on-failure";
                RestartSec = 3;
                # Hardening (tune as needed):
                NoNewPrivileges = true;
                PrivateTmp = true;
                ProtectSystem = "strict";
                ProtectHome = true;
                ReadWritePaths = [ "/var/lib/fedwiki" ];
              };
            };

            services.nginx = lib.mkIf (cfg.hostName != null) {
              enable = true;
              virtualHosts."${cfg.hostName}" = {
                forceSSL = true;
                enableACME = true;
                locations."/" = {
                  proxyPass = "http://127.0.0.1:${toString cfg.port}";
                  proxyWebsockets = true;
                };
              };
            };
          };
        };
      }
    );
}
