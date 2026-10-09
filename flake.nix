{
  description = "Isolated P41 candidate pinned to wiki rc.3";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/5e2305d577ca00acbba631b05cb1094d172b29f3";
  inputs."mech-composition".url = "github:RalfBarkow/wiki/9a9afef387e8c05587c95171119d627117798f56";
  outputs = inputs @ { self, nixpkgs, ... }: let
    systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];
  in {
    packages = nixpkgs.lib.genAttrs systems (system: let
      pkgs = import nixpkgs { inherit system; };
      candidateSource = pkgs.lib.fileset.toSource {
        root = ./.;
        fileset = pkgs.lib.fileset.unions [
          ./cli.js ./farm.js ./index.js ./version.js ./error-page.js
          ./package.json ./package-lock.json ./.npmignore ./LICENSE.txt
          ./candidate/build.mjs ./candidate/check-graph.mjs
          ./candidate/provenance.json ./candidate/packages
          ./candidate/packages-manifests
        ];
      };
      localArchive = name: builtins.path {
        path = ./candidate/packages + "/${name}.tgz";
        name = "${name}.tgz";
      };
      importHooks = pkgs.callPackages (nixpkgs + "/pkgs/build-support/node/import-npm-lock/hooks") {
        nodejs = pkgs.nodejs_22;
      };
      # Preserve the standard store-path translation/restoration. Require npm ci.
      offlineCiHook = importHooks.npmConfigHook.overrideAttrs (old: {
        buildCommand = old.buildCommand + ''
          substituteInPlace "$out/nix-support/setup-hook" \
            --replace-fail "npm install --ignore-scripts" "npm ci --offline --ignore-scripts"
        '';
      });
      sourcePins = builtins.fromJSON (builtins.readFile ./candidate/source-inputs.json);
      reconstructionSources = pkgs.linkFarm "p41-pinned-sources" (
        pkgs.lib.mapAttrsToList (name: pin: {
          inherit name;
          path = pkgs.fetchurl { inherit (pin) url hash; };
        }) sourcePins
      );
      reconstructionDescription = pkgs.lib.fileset.toSource {
        root = ./candidate;
        fileset = pkgs.lib.fileset.unions [
          ./candidate/assemble.py ./candidate/source-inputs.json
          ./candidate/package-trees.json ./candidate/provenance.json
          ./candidate/wiki-server.patch ./candidate/wiki-client.patch
          ./candidate/wiki-plugin-journalmatic.patch
          ./candidate/production-server.patch ./candidate/production-client.patch
        ];
      };
      sharedMech = inputs."mech-composition".packages.${system};
      withMech = profile: mech: import (inputs."mech-composition" + "/nix/wiki-profile.nix") {
        inherit pkgs profile mech;
        base = self.packages.${system}.default;
        recipe = "ralfbarkow";
      };
      profilePackages = {
        mech-upstream = sharedMech.mech-upstream;
        mech-discourse = sharedMech.mech-discourse;
        wiki-upstream = withMech "upstream" sharedMech.mech-upstream;
        wiki-discourse = withMech "discourse" sharedMech.mech-discourse;
      };
    in {
      inherit reconstructionSources;
      reconstruct = pkgs.runCommand "p41-reconstructed-packages" {
        nativeBuildInputs = [ pkgs.python313 pkgs.git ];
      } ''
        mkdir -p "$out"
        python ${reconstructionDescription}/assemble.py \
          --sources ${reconstructionSources} \
          --output "$out/packages" --report "$out/reconstruction.json"
      '';
      default = pkgs.buildNpmPackage {
        pname = "wiki-p41";
        version = "0.41.0-rc.3";
        src = candidateSource;
        nodejs = pkgs.nodejs_22;
        npmDeps = pkgs.importNpmLock {
          package = builtins.fromJSON (builtins.readFile ./package.json);
          packageLock = builtins.fromJSON (builtins.readFile ./package-lock.json);
          packageSourceOverrides = {
            "node_modules/wiki-server" = localArchive "wiki-server";
            "node_modules/wiki-client" = localArchive "wiki-client";
            "node_modules/wiki-plugin-journalmatic" = localArchive "wiki-plugin-journalmatic";
            "node_modules/wiki-plugin-mech" = localArchive "wiki-plugin-mech";
            "node_modules/wiki-plugin-solo" = localArchive "wiki-plugin-solo";
          };
        };
        npmConfigHook = offlineCiHook;
        npmFlags = [ "--ignore-scripts" ];
        npmBuildScript = "build:p41";
        nativeBuildInputs = [ pkgs.makeWrapper ];
        NODE_OPTIONS = "";
        SOURCE_DATE_EPOCH = "1";
        preBuild = ''
          export HOME="$TMPDIR/p41-build-home"
          mkdir -p "$HOME"
          node candidate/check-graph.mjs
        '';
        postInstall = ''
          target="$out/lib/node_modules/wiki"
          cp candidate/provenance.json "$target/p41-provenance.json"
          mkdir -p "$out/share/p41"
          cp candidate/provenance.json "$out/share/p41/provenance.json"
          cp candidate/graph-report.json "$out/share/p41/graph-report.json"
          wrapProgram "$out/bin/wiki" \
            --set-default WIKI_SERVER_REV "6e8d4e1433da6773016ca35641b797453a667ff0+p41" \
            --set-default WIKI_CLIENT_REV "d59dbd68c2a539d32add72e06d2fd74e9d6d60c2+p41"
        '';
      };
    } // profilePackages);
  };
}
