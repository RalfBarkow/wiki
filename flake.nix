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
        mechRev = "abd88d2da6c89029515f2a456356832dffe038ab";
        mechSrc = pkgs.fetchFromGitHub {
          owner = "RalfBarkow";
          repo = "wiki-plugin-mech";
          rev = mechRev;
          hash = "sha256-KJrG7bgqiY7rPYqU8Cg9FLcetgpOXtnIevKLgAnezWs=";
        };
        soloVersion = "0.1.30-1";
        soloSrc = pkgs.fetchurl {
          url = "https://registry.npmjs.org/wiki-plugin-solo/-/wiki-plugin-solo-${soloVersion}.tgz";
          hash = "sha256-HnKwvcEaA8uagQus0wmaC+uNAx5PuZdVVh+wJ7lYqrw=";
        };
        wikiRev = "646fa4aa56a6f81e1cc571d6e7725bdcdfc82958";
        wikiSrc = pkgs.fetchFromGitHub {
          owner = "fedwiki";
          repo = "wiki";
          rev = wikiRev;
          hash = "sha256-ESZjuf06uP59KYxlvHwI6B1opN1x2TndOrxYWY5ot9A=";
        };
        wikiServerRev = "9b842d7be8bc5e0990ec574b19fb5554830591a5";
        wikiServerSrc = pkgs.fetchFromGitHub {
          owner = "fedwiki";
          repo = "wiki-server";
          rev = wikiServerRev;
          hash = "sha256-zDMpcJPQHoreJ5p9zXoLUkkuq6BB49oVXtb28wkqLkw=";
        };
        wikiClientRev = "3f61a4862703f492b0d6bfb8695bd665b943bb38";
        wikiClientSrc = pkgs.fetchFromGitHub {
          owner = "fedwiki";
          repo = "wiki-client";
          rev = wikiClientRev;
          hash = "sha256-c+uctkCLTKpoc9bPsyOR7gOK920QX1MQcaIH7uyAU3Q=";
        };
      in {
        packages = {
          wiki = pkgs.buildNpmPackage {
            pname   = "wiki";
            version = "0.39.2";
            src     = wikiSrc;

            # Build/runtime Node
            nodejs = pkgs.nodejs_22;

            # Filled after first run if it mismatches
            npmDepsHash = "sha256-B2DWPvGTHgPriHUPgyA04s/AzDu+5BhCzqBJsQL0+Nk=";
            #npmDepsHash = lib.fakeHash;

            makeCacheWritable = true;

            # Only production deps for the CLI
            npmFlags = [ "--omit=dev" ];

            # Upstream has no build step
            dontNpmBuild = true;

            postInstall = ''
              wikiClientTarget="$out/lib/node_modules/wiki/node_modules/wiki-client"
              if [ -d "$wikiClientTarget" ]; then
                savedWikiClientBundle="$(mktemp -d)"
                if [ -f "$wikiClientTarget/client/client.js" ]; then
                  cp "$wikiClientTarget/client/client.js" "$savedWikiClientBundle/client.js"
                fi
                if [ -f "$wikiClientTarget/client/client.js.map" ]; then
                  cp "$wikiClientTarget/client/client.js.map" "$savedWikiClientBundle/client.js.map"
                fi
                find "$wikiClientTarget" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
                chmod u+w "$wikiClientTarget"
                tar -C "${wikiClientSrc}" --exclude=.git --exclude=node_modules --exclude=package-lock.json -cf - . | tar -C "$wikiClientTarget" -xf -
                if [ -f "$savedWikiClientBundle/client.js" ]; then
                  mkdir -p "$wikiClientTarget/client"
                  chmod u+w "$wikiClientTarget/client"
                  cp "$savedWikiClientBundle/client.js" "$wikiClientTarget/client/client.js"
                fi
                if [ -f "$savedWikiClientBundle/client.js.map" ]; then
                  mkdir -p "$wikiClientTarget/client"
                  chmod u+w "$wikiClientTarget/client"
                  cp "$savedWikiClientBundle/client.js.map" "$wikiClientTarget/client/client.js.map"
                fi
                chmod -R u+w "$wikiClientTarget"
                test -f "$wikiClientTarget/client/client.js" || { echo "missing browser bundle at $wikiClientTarget/client/client.js" >&2; exit 1; }
              fi

              wikiServerTarget="$out/lib/node_modules/wiki/node_modules/wiki-server"
              if [ -d "$wikiServerTarget" ]; then
                find "$wikiServerTarget" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
                chmod u+w "$wikiServerTarget"
                tar -C "${wikiServerSrc}" --exclude=.git --exclude=node_modules --exclude=package-lock.json -cf - . | tar -C "$wikiServerTarget" -xf -
                chmod -R u+w "$wikiServerTarget"
              fi

              cat > "$out/lib/node_modules/wiki/pinned-core-revs.json" <<EOF
              {
                "wiki": "${wikiRev}",
                "wiki-server": "${wikiServerRev}",
                "wiki-client": "${wikiClientRev}",
                "wiki-plugin-mech": "${mechRev}",
                "wiki-plugin-solo": "${soloVersion}"
              }
EOF

              node -e "const fs=require('fs'); const pkgPath='$out/lib/node_modules/wiki/package.json'; const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8')); pkg.dependencies = pkg.dependencies || {}; pkg.dependencies['wiki-plugin-mech'] = 'github:RalfBarkow/wiki-plugin-mech#${mechRev}'; pkg.dependencies['wiki-plugin-solo'] = '${soloVersion}'; fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')"
              ln -sfn node_modules/wiki-client "$out/lib/node_modules/wiki/wiki-client"
              ln -sfn node_modules/wiki-server "$out/lib/node_modules/wiki/wiki-server"
              ln -sfn wiki/node_modules/wiki-server "$out/lib/node_modules/wiki-server"
              ln -sfn wiki/node_modules/wiki-client "$out/lib/node_modules/wiki-client"

              mechTarget="$out/lib/node_modules/wiki/node_modules/wiki-plugin-mech"
              mkdir -p "$mechTarget"
              cp -R --no-preserve=mode,ownership ${mechSrc}/. "$mechTarget/"
              if [ ! -f "$mechTarget/client/mech.js" ] && [ -f "$mechTarget/src/client/mech.js" ]; then
                mkdir -p "$mechTarget/client"
                cp -R --no-preserve=mode,ownership "$mechTarget/src/client/." "$mechTarget/client/"
              fi
              mechClient="$mechTarget/client/mech.js"
              mechVersion="$(node -p "require('$mechTarget/package.json').version" 2>/dev/null || echo "unknown")"
              mechBuildTime="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
              mechCommit="${mechRev}"
              tmpFile="$mechClient.tmp"
              printf '%s\n' "globalThis.__MECH_BUILD__ = { MECH_VERSION: \"''${mechVersion}\", MECH_BUILD_TIME: \"''${mechBuildTime}\", MECH_GIT_COMMIT: \"''${mechCommit}\" };" > "$tmpFile"
              cat "$mechClient" >> "$tmpFile"
              mv "$tmpFile" "$mechClient"
              mkdir -p $out/lib/node_modules/wiki/plugins
              ln -sfn "$mechTarget" $out/lib/node_modules/wiki/plugins/mech
              test -f "$mechClient" || (echo "missing mech client at $mechClient" >&2; exit 1)

              soloTarget="$out/lib/node_modules/wiki/node_modules/wiki-plugin-solo"
              rm -rf "$soloTarget"
              mkdir -p "$soloTarget"
              tar -xzf "${soloSrc}" -C "$soloTarget" --strip-components=1
              test -f "$soloTarget/client/solo.js" || (echo "missing solo client at $soloTarget/client/solo.js" >&2; exit 1)
              ln -sfn "$soloTarget" $out/lib/node_modules/wiki/plugins/solo
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
            pkgs.nodejs_22
            pkgs.corepack
            pkgs.git
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
