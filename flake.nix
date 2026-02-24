{
  description = "fedwiki/wiki packaged from this checkout via buildNpmPackage";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
    "wiki-client-src" = {
      url = "github:RalfBarkow/wiki-client/8febbcfc9611b48c44e263bd0cdc7db2aec53a38";
      flake = false;
    };
    "wiki-server-src" = {
      url = "github:fedwiki/wiki-server/ec3527abf0d1c1e1929272d580a80905c1dbf381";
      flake = false;
    };
  };

  outputs = inputs @ { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        lib  = pkgs.lib;
        mechRev = "4b8051417dec6b0eff40878290a703b1fa60fb52";
        journalmaticRev = "aa5f5863bb8de8f697815b405cfb2f1a0e055ed9";
        mechSrc = pkgs.fetchFromGitHub {
          owner = "RalfBarkow";
          repo = "wiki-plugin-mech";
          rev = mechRev;
          hash = "sha256-UQyFvFY+buaZQ8mAilJL1/XOCzTMS02D4O9d3BKbiYc=";
        };
        journalmaticSrc = pkgs.fetchFromGitHub {
          owner = "RalfBarkow";
          repo = "wiki-plugin-journalmatic";
          rev = journalmaticRev;
          hash = "sha256-ox+ZA5kgAETyTcPY1+y4DUsy7YRmufYv/cJJ7lqZwWg=";
        };
        soloVersion = "0.1.30-1";
        soloSrc = pkgs.fetchurl {
          url = "https://registry.npmjs.org/wiki-plugin-solo/-/wiki-plugin-solo-${soloVersion}.tgz";
          hash = "sha256-HnKwvcEaA8uagQus0wmaC+uNAx5PuZdVVh+wJ7lYqrw=";
        };
        wikiClientSrc = inputs."wiki-client-src";
        wikiServerSrc = inputs."wiki-server-src";
      in {
        packages = {
          wiki = pkgs.buildNpmPackage {
            pname   = "wiki";
            # Keep in sync with package.json at repo root
            version = (lib.importJSON ./package.json).version;
            src     = ./.;

            # Build/runtime Node
            nodejs = pkgs.nodejs_22;
            nativeBuildInputs = [ pkgs.git ];

            # Set to lib.fakeHash when package-lock.json changes, then replace with the "got: sha256-..." value from nix build.
            npmDepsHash = "sha256-kxIOeiIn6SWivhzlT6NC2ZOeDTF1MnCxrNPfR9F82gg=";

            makeCacheWritable = true;

            # Only production deps for the CLI
            npmFlags = [ "--omit=dev" "--omit=optional" ];

            # Upstream has no build step
            dontNpmBuild = true;

            prePatch = ''
              # Stage pinned wiki-client into the source tree for this build.
              rm -rf vendor/wiki-client
              mkdir -p vendor/wiki-client
              tar -C "${wikiClientSrc}" --exclude=.git -cf - . | tar -C vendor/wiki-client -xf -
              rm -rf vendor/wiki-server
              mkdir -p vendor/wiki-server
              tar -C "${wikiServerSrc}" --exclude=.git -cf - . | tar -C vendor/wiki-server -xf -
            '';

            postInstall = ''
              # Replace wiki-client with the staged checkout.
              wikiClientTarget="$out/lib/node_modules/wiki/node_modules/wiki-client"
              rm -rf "$wikiClientTarget"
              mkdir -p "$wikiClientTarget"
              tar -C "$PWD/vendor/wiki-client" -cf - . | tar -C "$wikiClientTarget" -xf -
              chmod -R u+w "$wikiClientTarget"

              # Keep browser test harness sourced from pinned wiki-client.
              testTarget="$wikiClientTarget/client/test"
              mkdir -p "$testTarget"
              cp -R "$PWD/vendor/wiki-client/client/test/." "$testTarget/"

              # Replace wiki-server with the staged checkout.
              wikiServerTarget="$out/lib/node_modules/wiki/node_modules/wiki-server"
              mkdir -p "$wikiServerTarget"
              tar -C "$PWD/vendor/wiki-server" --exclude=.git --exclude=node_modules --exclude=package-lock.json -cf - . | tar -C "$wikiServerTarget" -xf -
              chmod -R u+w "$wikiServerTarget"

              # Fix /system/plugins.json for ESM (avoid require.main.require).
              serverJs="$out/lib/node_modules/wiki/node_modules/wiki-server/lib/server.js"
              if [ -f "$serverJs" ]; then
                substituteInPlace "$serverJs" \
                  --replace \
                    "const pluginNames = Object.keys(require.main.require('./package').dependencies)" \
                    "const packageJson = JSON.parse(fs.readFileSync(path.join(argv.packageDir, '..', 'package.json'), 'utf8')); const pluginDeps = { ...(packageJson.dependencies || {}), ...(packageJson.optionalDependencies || {}) }; const pluginNames = Object.keys(pluginDeps)"
                substituteInPlace "$serverJs" \
                  --replace \
                    "Object.keys(packageJson.dependencies)" \
                    "Object.keys({ ...(packageJson.dependencies || {}), ...(packageJson.optionalDependencies || {}) })"
              fi

              # Fix plugin pages lookup in page.js for ESM/Nix (avoid require.main.*).
              pageJs="$out/lib/node_modules/wiki/node_modules/wiki-server/lib/page.js"
              if [ -f "$pageJs" ]; then
                substituteInPlace "$pageJs" \
                  --replace \
                    "Object.keys(packageJson.dependencies)" \
                    "Object.keys((() => { const packageJson = JSON.parse(fs.readFileSync(path.join(argv.packageDir, '..', 'package.json'), 'utf8')); return { ...(packageJson.dependencies || {}), ...(packageJson.optionalDependencies || {}) }; })())"
                substituteInPlace "$pageJs" \
                  --replace \
                    "const pagesPath = path.join(path.dirname(require.resolve(`''${plugin}/package`)), 'pages')" \
                    "const pagesPath = path.join(argv.packageDir, plugin, 'pages')"
              fi

              # Vendor mech into the closure and ensure client/mech.js exists.
              mechTarget="$out/lib/node_modules/wiki/node_modules/wiki-plugin-mech"
              rm -rf "$mechTarget"
              cp -R "${mechSrc}" "$mechTarget"
              chmod -R u+w "$mechTarget"
              if [ ! -f "$mechTarget/client/mech.js" ] && [ -f "$mechTarget/src/client/mech.js" ]; then
                mkdir -p "$mechTarget/client"
                cp -R "$mechTarget/src/client/"* "$mechTarget/client/"
              fi
              test -f "$mechTarget/client/mech.js" || { echo "missing mech client/mech.js in $mechTarget" >&2; exit 1; }

              pluginsDir="$out/lib/node_modules/wiki/plugins"
              mkdir -p "$pluginsDir"
              rm -f "$pluginsDir/mech"
              ln -s "$mechTarget" "$pluginsDir/mech"

              # Vendor journalmatic into the closure and ensure client/check-page.html exists.
              journalTarget="$out/lib/node_modules/wiki/node_modules/wiki-plugin-journalmatic"
              rm -rf "$journalTarget"
              cp -R "${journalmaticSrc}" "$journalTarget"
              chmod -R u+w "$journalTarget"
              test -f "$journalTarget/client/check-page.html" || { echo "missing journalmatic client/check-page.html in $journalTarget" >&2; exit 1; }
              rm -f "$pluginsDir/journalmatic"
              ln -s "$journalTarget" "$pluginsDir/journalmatic"

              # Vendor solo into the closure and ensure client assets exist.
              soloTarget="$out/lib/node_modules/wiki/node_modules/wiki-plugin-solo"
              rm -rf "$soloTarget"
              mkdir -p "$soloTarget"
              tar -xzf "${soloSrc}" -C "$soloTarget" --strip-components=1
              chmod -R u+w "$soloTarget"
              test -f "$soloTarget/client/solo.js" || { echo "missing solo client/solo.js in $soloTarget" >&2; exit 1; }
              test -f "$soloTarget/client/dialog/index.html" || { echo "missing solo client/dialog/index.html in $soloTarget" >&2; exit 1; }
              rm -f "$pluginsDir/solo"
              ln -s "$soloTarget" "$pluginsDir/solo"
            '';

            meta = {
              description = "Federated Wiki command-line server";
              homepage    = "https://github.com/fedwiki/wiki";
              mainProgram = "wiki";
              license     = lib.licenses.mit;
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
