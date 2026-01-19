{
  description = "fedwiki/wiki packaged from this checkout via buildNpmPackage";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        lib  = pkgs.lib;
        mechSrc = pkgs.fetchFromGitHub {
          owner = "RalfBarkow";
          repo = "wiki-plugin-mech";
          rev = "ac371a69a05ac75b4f2286fa696182219ef3c52f";
          hash = "sha256-MTxSgINDB+W9CsEnl2EeCdZaWb6nPOrf9btB9V7HSUA=";
        };
      in {
        packages = {
          wiki = pkgs.buildNpmPackage {
            pname   = "wiki";
            # Keep in sync with package.json at repo root
            version = (lib.importJSON ./package.json).version;
            src     = ./.;

            # Build/runtime Node
            nodejs = pkgs.nodejs_22;

            # Filled after first run if it mismatches
            npmDepsHash = "sha256-RtNAFoks1B2fkPrIMJr8wNWSt+EoXw2ZpnY7Sl9eSDk=";
            #npmDepsHash = lib.fakeHash;

            makeCacheWritable = true;

            # Only production deps for the CLI
            npmFlags = [ "--omit=dev" ];

            # Upstream has no build step
            dontNpmBuild = true;

            postInstall = ''
              mechTarget="$out/lib/node_modules/wiki/node_modules/wiki-plugin-mech"
              mkdir -p "$mechTarget"
              cp -R --no-preserve=mode,ownership ${mechSrc}/. "$mechTarget/"
              if [ ! -f "$mechTarget/client/mech.js" ] && [ -f "$mechTarget/src/client/mech.js" ]; then
                mkdir -p "$mechTarget/client"
                cp -R --no-preserve=mode,ownership "$mechTarget/src/client/." "$mechTarget/client/"
              fi
              mkdir -p $out/lib/node_modules/wiki/plugins
              ln -sfn "$mechTarget" $out/lib/node_modules/wiki/plugins/mech
              test -f "$mechTarget/client/mech.js" || (echo "missing mech client at $mechTarget/client/mech.js" >&2; exit 1)
            '';

            meta = {
              description = "Federated Wiki command-line server";
              homepage    = "https://github.com/fedwiki/wiki";
              mainProgram = "wiki";
              license     = lib.licenses.mit;
              # Make available on Linux and macOS
              platforms   = lib.platforms.linux ++ lib.platforms.darwin;
            };
          };
        };

        # nix build
        defaultPackage = self.packages.${system}.wiki;

        # nix run
        apps.wiki = {
          type    = "app";
          program = lib.getExe self.packages.${system}.wiki;
        };
        defaultApp = self.apps.${system}.wiki;

        # nix develop / direnv use flake .
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_20      # handy runtime for hacking (npm included)
            pkgs.corepack
            pkgs.jq
          ];
          shellHook = ''
            echo "Dev shell for fedwiki/wiki"
            echo "  node: $(node -v)"
            echo "  npm : $(npm -v 2>/dev/null || true)"
          '';
        };

        # Optional: NixOS module (harmless on Darwin)
        nixosModules.fedwiki = { config, lib, pkgs, ... }:
          let cfg = config.services.fedwiki;
          in {
            options.services.fedwiki = {
              enable  = lib.mkEnableOption "Federated Wiki server";
              package = lib.mkOption {
                type = lib.types.package;
                default = self.packages.${system}.wiki;
                description = "Wiki package to run";
              };
              user  = lib.mkOption { type = lib.types.str; default = "fedwiki"; };
              group = lib.mkOption { type = lib.types.str; default = "fedwiki"; };
              port  = lib.mkOption { type = lib.types.port; default = 3000; };
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
      });
}
