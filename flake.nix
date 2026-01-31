{
  description = "fedwiki/wiki packaged for NixOS";

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

        graphvizRev = "609ca0da68e964bacd132aa58884570dbc7830e4";
        graphvizSrc = pkgs.fetchFromGitHub {
          owner = "fedwiki";
          repo = "wiki-plugin-graphviz";
          rev = graphvizRev;
          hash = "sha256-wnuNfB1GgBAorel1mY9hyBQdKLg1yHsBY8bPbq0A+XQ=";
          # If you prefer the “first run tells you” workflow:
          # hash = lib.fakeHash;
        };

        soloRev = "17915844349bada64c901bd5ea73472702c446f9";
        soloSrc = pkgs.fetchFromGitHub {
          owner = "WardCunningham";
          repo = "wiki-plugin-solo";
          rev = soloRev;
          hash = "sha256-73eSiWqSzIZK0vc4UTKEmDmA1YBenWaaPQfULh7j18w=";
        };

        journalmaticRev = "8fcf50cacf3ea432cdfeda42a6b86c27ca34e23d";
        journalmaticSrc = pkgs.fetchFromGitHub {
          owner = "fedwiki";
          repo = "wiki-plugin-journalmatic";
          rev = journalmaticRev;
          hash = "sha256-Cik9YNdH3SQo/PFtb6CQBh2kEwotm89moFjqq4gWdUk=";
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
            npmDepsHash = "sha256-uriQOL/UF2hJz1k+vYl5SfXK5J2TGpb3pNw87c99eCg=";
            #npmDepsHash = lib.fakeHash;

            makeCacheWritable = true;

            # Only production deps for the CLI
            npmFlags = [ "--omit=dev" ];

            # Upstream has no build step
            dontNpmBuild = true;

            postInstall = ''
              # --- pin wiki-plugin-mech into the built node_modules ---
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

              # --- pin wiki-plugin-graphviz (Ward fix commit 609ca0d...) ---
              graphvizTarget="$out/lib/node_modules/wiki/node_modules/wiki-plugin-graphviz"
              mkdir -p "$graphvizTarget"
              cp -R --no-preserve=mode,ownership ${graphvizSrc}/. "$graphvizTarget/"

              # Ensure it appears in /plugin/* discovery like other bundled plugins
              mkdir -p $out/lib/node_modules/wiki/plugins
              ln -sfn "$graphvizTarget" $out/lib/node_modules/wiki/plugins/graphviz
              test -f "$graphvizTarget/package.json" || (echo "missing graphviz package.json at $graphvizTarget/package.json" >&2; exit 1)

              # --- pin wiki-plugin-solo (Ward commit 1791584...) ---
              soloTarget="$out/lib/node_modules/wiki/node_modules/wiki-plugin-solo"
              mkdir -p "$soloTarget"
              cp -R --no-preserve=mode,ownership ${soloSrc}/. "$soloTarget/"

              # Ensure it appears in /plugin/* discovery like other bundled plugins
              mkdir -p $out/lib/node_modules/wiki/plugins
              ln -sfn "$soloTarget" $out/lib/node_modules/wiki/plugins/solo
              test -f "$soloTarget/package.json" || (echo "missing solo package.json at $soloTarget/package.json" >&2; exit 1)

              # --- pin wiki-plugin-journalmatic (commit 8fcf50c...) ---
              journalmaticTarget="$out/lib/node_modules/wiki/node_modules/wiki-plugin-journalmatic"
              mkdir -p "$journalmaticTarget"
              cp -R --no-preserve=mode,ownership ${journalmaticSrc}/. "$journalmaticTarget/"

              # Ensure it appears in /plugin/* discovery like other bundled plugins
              mkdir -p $out/lib/node_modules/wiki/plugins
              ln -sfn "$journalmaticTarget" $out/lib/node_modules/wiki/plugins/journalmatic
              test -f "$journalmaticTarget/package.json" || (echo "missing journalmatic package.json at $journalmaticTarget/package.json" >&2; exit 1)
            '';
          };

          default = self.packages.${system}.wiki;
        };
      }
    );
}
