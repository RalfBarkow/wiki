{ pkgs, base, mech, profile, recipe }:
base.overrideAttrs (old: {
  pname = "wiki-${recipe}-${profile}";
  # Existing core/plugin recipe is retained. This explicit build-time replacement
  # never falls back to its legacy Mech; defaults still use the unchanged base.
  postInstall = (old.postInstall or "") + ''
    mechTarget="$out/lib/node_modules/wiki/node_modules/wiki-plugin-mech"
    rm -rf "$mechTarget"
    cp -R ${mech} "$mechTarget"
    chmod -R u+w "$mechTarget"
    pluginsDir="$out/lib/node_modules/wiki/plugins"
    mkdir -p "$pluginsDir"
    rm -f "$pluginsDir/mech"
    ln -s "$mechTarget" "$pluginsDir/mech"
    node - "$out/lib/node_modules/wiki/package.json" "$mechTarget/provenance.json" <<'JS'
    const fs=require('fs'),path=require('path');const [pkgFile,proofFile]=process.argv.slice(2);
    const pkg=JSON.parse(fs.readFileSync(pkgFile));const proof=JSON.parse(fs.readFileSync(proofFile));
    const deps=pkg.optionalDependencies?.['wiki-plugin-mech']?pkg.optionalDependencies:pkg.dependencies;
    deps['wiki-plugin-mech']='github:WardCunningham/wiki-plugin-mech#'+proof.source.oid;
    pkg.mechComposition={profile:proof.profile,source:proof.source,module:proof.packaging.moduleSource};
    fs.writeFileSync(pkgFile,JSON.stringify(pkg,null,2)+'\n');
    const root=path.dirname(pkgFile),baseRecords={};
    for(const name of ['pinned-core-revs.json','p41-provenance.json']){
      const file=path.join(root,name);if(fs.existsSync(file))baseRecords[name]=JSON.parse(fs.readFileSync(file));
    }
    const components={};
    for(const name of Object.keys({...pkg.dependencies,...pkg.optionalDependencies})){
      const file=path.join(root,'node_modules',name,'package.json');
      if(fs.existsSync(file))components[name]={version:JSON.parse(fs.readFileSync(file)).version,declared:({...pkg.dependencies,...pkg.optionalDependencies})[name]};
    }
    fs.writeFileSync(path.join(root,'wiki-composition-provenance.json'),JSON.stringify({schemaVersion:1,recipe:'${recipe}',profile:'${profile}',baseRecipeRecords:baseRecords,mech:proof,components},null,2)+'\n');
    // The old installed pin record is now a base recipe record, not the final Mech selection.
    if(baseRecords['pinned-core-revs.json']){
      const current={...baseRecords['pinned-core-revs.json'],'wiki-plugin-mech':proof.source.oid,mechProfile:proof.profile};
      fs.writeFileSync(path.join(root,'pinned-core-revs.json'),JSON.stringify(current,null,2)+'\n');
    }
    JS
    cmp ${mech}/client/mech.js "$mechTarget/client/mech.js"
    test "$(readlink "$pluginsDir/mech")" = "$mechTarget"
  '';
  passthru = (old.passthru or {}) // { mechComposition = { inherit profile recipe mech; }; };
})
