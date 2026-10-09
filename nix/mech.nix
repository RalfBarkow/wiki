{ pkgs, profile }:
let
  lib = pkgs.lib;
  identities = lib.importJSON ./mech-pins.json;
  upstream = pkgs.fetchFromGitHub {
    owner = "WardCunningham";
    repo = "wiki-plugin-mech";
    rev = identities.upstreamMech.oid;
    hash = identities.upstreamMech.narHash;
  };
  module = lib.cleanSourceWith {
    src = ../integrations/mech;
    filter = path: type: !(builtins.elem (baseNameOf path) [ ".artifacts" "node_modules" ".git" ]);
  };
in assert builtins.elem profile [ "upstream" "discourse" ];
pkgs.buildNpmPackage {
  pname = "wiki-plugin-mech-${profile}";
  version = "0.1.48-3";
  src = module;
  nodejs = pkgs.nodejs_22;
  nativeBuildInputs = [ pkgs.git ];
  npmDepsHash = "sha256-C9KbPLd8mzX8a2wzYsflqK5Vo7+hF56vtYfDUktyFkk=";
  dontNpmBuild = true;
  buildPhase = ''
    runHook preBuild
    node ${./mech-build.mjs} "$PWD" ${upstream} ${profile} "$TMPDIR/composed" ${./mech-pins.json}
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p "$out"
    cp -R ${upstream}/. "$out/"
    chmod -R u+w "$out"
    cp "$TMPDIR/composed/${profile}/client/"* "$out/client/"
    cp "$TMPDIR/composed/${profile}/provenance.json" "$out/provenance.json"
    cp "$TMPDIR/composed/${profile}/metafile.json" "$out/metafile.json"
    cp LICENSE "$out/LICENSE-Discourse-composition"
    runHook postInstall
  '';
  passthru = { inherit profile identities; };
  meta = { license = lib.licenses.mit; platforms = lib.platforms.linux ++ lib.platforms.darwin; };
}
