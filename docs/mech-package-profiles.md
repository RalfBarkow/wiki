# Maintained Mech package profiles

## Source and declared deployment authority

The reviewed module commit is `971794d2066f87f63e7685447352340d5276a959` in RalfBarkow/wiki, path `integrations/mech`, version 0.1.0. Its source digest is `4b4dea00306480b43d200f435e79541b5d3dc8dcc0549ee7785166cfeffb3b51`; lock digest `a270bbc60832486c1bbf5ba8bfb957e7fd9b9bbe9be11e0c790e44dc1820a103`. The clean localhost branch was fast-forwarded from `8e6c2e53a47f038f4b0c6d2ef35576cc1d4f456c` to this direct child. No module source or historical acceptance record was rewritten. Null extension OIDs in those records describe their original execution state.

The operator identifies the server-specific branches as the declared configuration authority. Active server processes, proxy routing and installed packages remain unknown and are not prerequisites for this source integration.

| Recipe | Recorded source revision | Core/client/server selection | Other retained differences |
|---|---|---|---|
| localhost | `8e6c2e53a47f038f4b0c6d2ef35576cc1d4f456c` | Wiki 0.39.1; lock resolves RalfBarkow client `4b290709a1906c2010306f0f47ebfad530d8b4b6` and server `0ea9ba00d8286faba7633e413e9786e3c4508fa8` | Rebuilds client; optional local legacy-Mech override; Journalmatic `aa5f5863bb8de8f697815b405cfb2f1a0e055ed9` |
| dreyeck.ch | `548ee4c31ec7824bf19954b745f12b3b5212fc2b` | Wiki `646fa4aa56a6f81e1cc571d6e7725bdcdfc82958` / 0.39.2; client source `3f61a4862703f492b0d6bfb8695bd665b943bb38`; server `9b842d7be8bc5e0990ec574b19fb5554830591a5` | Preserves npm-installed browser client bundle while replacing client source; Journalmatic 0.2.2 |
| wiki.ralfbarkow.ch | P41 candidate `b42eb888d6e5d59803667c6320e0779523fc265c` | Wiki rc.3 `96d3080fa10e259d6d4db71000ee25f4a5721b9d`; client `d59dbd68c2a539d32add72e06d2fd74e9d6d60c2` plus P41 patches; server `6e8d4e1433da6773016ca35641b797453a667ff0` plus P41 patches | Offline reconstructed packages; separate nixpkgs `5e2305d577ca00acbba631b05cb1094d172b29f3`; Journalmatic 0.2.3 with owned metadata; modern client/server patches |

The localhost flake's written client/server URLs name `1aba5592…` / `ec3527ab…`, but its lock resolves the RalfBarkow revisions above. Both written and resolved identities are retained; no reconciliation/update was made. The Dreyeck preserved client bundle is not asserted to have been compiled from the replacement client source. Served bytes and installed package records identify it independently. Solo stays 0.1.30-1 in every recipe. Complete per-profile plugin versions and provenance are in the acceptance JSON and installed `wiki-composition-provenance.json`.

## Outputs and shared implementation

The development flake exposes:

- `mech-upstream`, `mech-discourse`: one upstream source pin, `a028b4bba04e539dcaa090423d38a00a0050489d`, with two independent builds.
- `wiki-upstream`: the P41 / wiki.ralfbarkow.ch recipe plus upstream-only Mech.
- `wiki-discourse`: the Dreyeck recipe plus Discourse Mech.
- `wiki-localhost-upstream`, `wiki-localhost-discourse`, `wiki-dreyeck-upstream`, `wiki-ralfbarkow-discourse`: explicit cross-profile selections preserving the named base recipe.
- Existing `wiki`, default package/app and service defaults retain their original selection. No default is promoted to either maintained profile.

The site branches consume the same committed composition flake by an explicit `mech-composition` input and import its build-time profile overlay. Their `wiki-upstream` / `wiki-discourse` outputs use their own unchanged base recipe. They do not copy EXTRACT, EDGES, DEBUG, WALK or the dispatcher. Updating the shared input is an explicit reviewed intake, not a branch-following automatic update.

`nix/mech.nix` uses the module's unchanged npm lock and measured fixed-output npm cache hash. It calls the accepted `buildProfiles` implementation rather than copying its compiler recipe. The source adapter verifies the original upstream tree and commit objects from `nix/mech-pins.json`, reconstructed from the hash-verified source snapshot and original commit bytes. This is an archive-only object store, not a full history checkout. Original source inventory, tree OID and full commit OID must all agree before compilation. No invented source revision, copied dispatcher, network Git fetch inside the build, or legacy fallback is used.

Both bundles are self-contained ESM. Upstream has 31 commands; Discourse has 34, adding EXTRACT/EDGES/DEBUG and the guarded role-aware WALK wrapper. Ordinary WALK delegates unchanged. CODE, SOLO, LISTEN and MESSAGE remain supplied by the unchanged upstream source. No NEIGHBORS wrapper, graph resolution change, typed-relations projection or experimental LISTEN forwarding is included.

The package overlay retains the complete base recipe and then replaces its legacy Mech directory and plugin link with the selected immutable artifact. This explicit build-time replacement does not fall back to the legacy implementation. Existing core, Code, Solo, Journalmatic and other plugin versions are preserved. Base pin/provenance records are kept as base-recipe evidence, separately from the final composition record. The older installed pinned-core record is updated only for the final Mech selection. Nothing modifies an installed/running plugin at runtime.

## Reproduce and inspect

```sh
nix build --no-write-lock-file --no-link .#mech-upstream .#mech-discourse
nix build --no-write-lock-file --no-link .#wiki-upstream .#wiki-discourse
nix build --no-write-lock-file --no-link .#wiki-localhost-upstream .#wiki-localhost-discourse
nix build --no-write-lock-file --no-link .#wiki-dreyeck-upstream .#wiki-ralfbarkow-discourse
nix build --no-write-lock-file --no-link --rebuild .#mech-upstream .#mech-discourse
```

Profiles install `/plugins/mech/mech.js`, its stylesheet and `provenance.json`; the Wiki root adds `wiki-composition-provenance.json`. That record distinguishes final Mech source/build identity from base-recipe component records. Mech's builder content identity and the committed module identity are separate fields; static pre-commit identity fields in the unchanged builder are not retroactively substituted into historical records.

Existing module regression entry points remain under `integrations/mech/test/`: contracts, semantic, ambiguity, browser, evidence-retention and acceptance-contracts. Supply explicit repository/dependency/browser inputs as documented by that module. The new package browser contract is:

```sh
node integration-tests/package-browser.mjs \
  "$UPSTREAM_WIKI_ROOT" "$DISCOURSE_WIKI_ROOT" "$PLAYWRIGHT_CORE" "$BROWSER"
```

The roots are the built `lib/node_modules/wiki` directories. It starts disposable actual Wiki servers/clients, with only a fixture security provider and disposable data. It observes actual served Mech bytes/catalogs, original trusted Trails Code/helper/import items, two aspect graphs, the unchanged SOLO batch sender and real Discourse commands. The Solo receiver is explicitly a trusted isolated fixture; no deployed Solo or Graphviz/SVG lifecycle is inferred.

Only selected trusted source is executed. Graph and Cypher are original retained response bytes pinned by SHA-256, with no invented Git OID. The older Code plugin's unpinned Highlight.js display imports are fulfilled by an explicitly version/integrity-pinned offline 11.11.1 fixture compiled with esbuild 0.28.2, not described as a captured CDN response. All other external requests are aborted. These display/import fixture pins do not rewrite production Code or page source.

The original `CODE trails` returns two aspects in both actual Wiki clients. Each aspect has three nodes and two relations. The five-name/four-relation combined count is a derived value projection used to compare the earlier controlled witness; it is not a replay of the original rendered SVG or a new object-identity claim. The original public Wiki page is not executed or modified.

## Acceptance boundaries

macOS x86_64 package construction and isolated Chrome runtime acceptance are separate evidence. Linux package outputs are evaluated, but a full Linux package build, browser run and host closure verification remain outstanding. Source compatibility at a028b4b is not generalized to newer upstream revisions.

Full behavioral equivalence remains **FAIL** (33 pass, two known differences). Duplicate-slug ambiguity retains four cases and four uninstrumented controls. Role WALK constructs Wiki-neighborhood graphs from selected roots; it does not project typed Discourse edges. Date ordering is not a site-identity policy.

CODE's truthy-initiator guard is invocation gating, not a JavaScript sandbox. The tests execute trusted authored fixtures. Production page/import/message trust requires a separate decision, including Ward's separately reported temporary LISTEN initiator snippet. Production Solo compatibility remains unverified.

## Declared selection and later rollback

The new variants are opt-in. For wiki.ralfbarkow.ch, select that branch's `packages.<system>.wiki-upstream` only after its preserved P41 candidate and trust restrictions are deliberately accepted. For discourse.dreyeck.ch, select the Dreyeck branch's `wiki-discourse`. The branch exports both profiles independently, but a hostname alone does not select a package.

The farm clones its process arguments for each Wiki and permits wiki-domain overrides. These flakes do not declare independent per-hostname Mech asset selections. A farm normally shares its package/client/server roots; domain overrides and module-level imports do not establish safe independent plugin deployments. Whether Discourse and hyperdoc Wiki hostnames share a process remains unknown. `hyperdoc.dreyeck.ch` is an undecided Wiki target; the Lisp HyperDoc application on dreyeck.ch is a different deployment.

Use the existing host configuration's actual package-selection interface (for example `services.fedwiki.package` where that module is used, or the configured Wiki executable). No service selection is changed here. Push/publication, selecting the exact committed shared input, building a Linux closure and activation/restart are future separate steps. An unpublished shared input can be tested locally with `--override-input mech-composition path:/path/to/the/committed/composition-checkout --no-write-lock-file`; that override is never committed as a machine-local dependency.

Before any later activation, record the prior branch/input revision and package outPath. Roll back by restoring that exact selection and configuration/generation. Existing defaults remain available: Dreyeck `wiki`, P41 `default`, localhost `wiki`. No activation or rollback operation was executed in this task.

The display fixture is generated and ignored, not an opaque vendored bundle. Reconstruct it before the browser test with `node integration-tests/rebuild-highlight.mjs /path/to/verified/highlight.js-11.11.1.tgz /path/to/esbuild-0.28.2`. The script checks the recorded npm SHA-512 integrity and compiler version and builds from a canonical staging directory without network access. Source input: `https://registry.npmjs.org/highlight.js/-/highlight.js-11.11.1.tgz`. The authored fixture manifest retains the output digests. Graph/Cypher snapshots retain their original response whitespace and hashes.

The independent Nix rebuild checks passed for both Mech outputs and both primary Wiki outputs (`wiki-upstream`, `wiki-discourse`). The unchanged localhost recipe still embeds a wall-clock client banner, so complete localhost Wiki output reproducibility is not claimed; its Mech bundles are deterministic. This existing metadata difference is not silently normalized. Tests use a clearly separate fixture security provider to exercise the real server's authorization middleware, not the production friends/passport authentication implementation.
