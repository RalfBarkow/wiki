{ pkgs }:

let
  src = pkgs.lib.fileset.toSource {
    root = ../.;
    fileset = pkgs.lib.fileset.unions [
      ../cli.js
      ../farm.js
      ../index.js
      ../version.js
      ../error-page.js
      ../package.json
      ../package-lock.json
      ../.npmignore
      ../LICENSE.txt
      ../ReadMe.md
    ];
  };
  npmHooks = pkgs.callPackages
    (pkgs.path + "/pkgs/build-support/node/import-npm-lock/hooks")
    { nodejs = pkgs.nodejs_22; };
in
pkgs.buildNpmPackage {
  pname = "wiki";
  version = "0.41.1";
  inherit src;
  nodejs = pkgs.nodejs_22;
  npmDeps = pkgs.importNpmLock { npmRoot = src; };
  npmConfigHook = npmHooks.npmConfigHook.overrideAttrs (old: {
    buildCommand = old.buildCommand + ''
      substituteInPlace "$out/nix-support/setup-hook" \
        --replace-fail "npm install --ignore-scripts" "npm ci --offline --ignore-scripts"
    '';
  });
  npmFlags = [ "--omit=dev" "--ignore-scripts" ];
  npmRebuildFlags = [ "--offline" "--ignore-scripts" ];
  dontNpmBuild = true;

  postInstall = ''
    root="$out/lib/node_modules/wiki"
    node - "$root" <<'JS'
    const { readFileSync, statSync } = require('node:fs')
    const { join } = require('node:path')
    const assert = require('node:assert/strict')
    const root = process.argv[2]
    for (const [file, expected] of [
      ['package.json', '0.41.1'],
      ['node_modules/wiki-client/package.json', '0.33.1'],
      ['node_modules/wiki-server/package.json', '0.28.2'],
    ]) {
      assert.equal(JSON.parse(readFileSync(join(root, file), 'utf8')).version, expected)
    }
    assert(statSync(join(root, 'node_modules/wiki-client/client/client.js')).size > 0)
    JS
  '';

  meta.mainProgram = "wiki";
}
