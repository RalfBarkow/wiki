# Maintained Mech source composition — development module

This private Wiki-owned module builds unchanged pinned Mech source with optional, separately identified Discourse operations. It is not a package integration, release, new runtime extension API or migration decision.

## Ownership and identities

- Wiki authority: https://github.com/RalfBarkow/wiki; observed base `8e6c2e53a47f038f4b0c6d2ef35576cc1d4f456c`.
- Module: `integrations/mech`, declared version `0.1.0`. While uncommitted, extension identity is the Wiki base, module path/version, exact authored-content digest and dependency-lock digest. `extensionCommitOid` is null; no independent Git release is claimed.
- Upstream: https://github.com/WardCunningham/wiki-plugin-mech at `a028b4bba04e539dcaa090423d38a00a0050489d`.
- Behavioral baseline: https://github.com/RalfBarkow/wiki-plugin-mech at `abd88d2da6c89029515f2a456356832dffe038ab`, used only for tests/provenance.
- `sources.json` records all pinned source-file hashes. Original MIT attribution is retained in LICENSE; extension functions are ported from the baseline blocks/library definitions. The builder never regenerates extension semantics from upstream or the fork.

## Two explicit profiles

`upstream` does not import/install Discourse operations. `discourse` adds EXTRACT, EDGES and DEBUG and explicitly wraps WALK for question/claim/support/oppose modes. Ordinary WALK delegates with its original invocation and return value. Other upstream emitter identities, parser and dispatcher remain unchanged. The exported mutable catalog is an undocumented source-level integration point, checked on every intake, not a stable public browser registration API.

The extension imports only Mech helpers through the `mech-upstream` build alias and uses the Mech/Wiki browser contracts already needed by the operations. It does not import this Wiki's server, configuration or packaging internals, or HyperDoc. It can later be extracted without redesigning its implementation.

The scratch composition SHA-256 `b24c308194eb857bce7789d42a2b0535441099029913e323dd457583d6e62bc5` is retained as historical evidence, not an opaque vendored artifact or the expected digest of this differently packaged build.

## Reconstruct without changing any Wiki package

From this directory, supply explicit locally available source and dependency inputs:

```sh
node scripts/build.mjs --repository /path/to/local/mech-git \
  --dependencies /path/to/verified/node_modules --profile all --output .artifacts/build
node test/contracts.mjs --repository /path/to/local/mech-git --dependencies /path/to/verified/node_modules
node test/semantic.mjs --repository /path/to/local/mech-git --dependencies /path/to/verified/node_modules
node test/ambiguity.mjs --repository /path/to/local/mech-git --dependencies /path/to/verified/node_modules
node test/browser.mjs --repository /path/to/local/mech-git --dependencies /path/to/verified/node_modules \
  --playwright /path/to/installed/playwright-core --browser /path/to/browser-executable \
  --jquery /path/to/jquery-3.7.1.min.js
```

Use `--profile upstream` or `--profile discourse` for independent builds. Unknown profiles, absent Git objects, source-integrity failures and incompatible catalog interfaces fail closed. No command fetches Git source, installs dependencies/browser binaries, edits the root package or changes services. Outputs are ignored under `.artifacts/`.

The module-local npm lock retains exact build/runtime dependency versions and integrity metadata from the pinned upstream lock, pruned to this module's dependency closure. Already-installed dependencies are checked against these versions; the recipe records their identities. Future clean `npm ci` reconstruction requires separate dependency-install authorization and is not claimed by the current reused-installation run.

Browser tooling is an explicit external input: Playwright-core 1.62.1, the real browser, and trusted jQuery 3.7.1. Its exact installed content/binary digests are recorded in browser results. The available Playwright installation had no locally cached npm metadata for 1.62.1, so it is not silently given an invented npm integrity or replaced with an older release. No dependency was downloaded or installed. Build reproducibility and external browser-tool identity are separate claims.

Each profile emits `client/mech.js`, unchanged upstream stylesheet, compiler metadata and provenance. Authored content is hashed as the sorted relative-path/file-hash list, excluding generated `.artifacts/` and `node_modules/`. Builds stage verified Git archives, run the compiler in that canonical staged working directory and reject source changes. Generated artifact provenance records the build profile, source authorities/full OIDs, uncommitted extension identity, lock hash, Node/platform and dependency versions. No development checkout path is needed by the runtime bundle.

## Separate acceptance contracts

Catalog tests verify profile absence/presence, one catalog, original emitter identities, atomic collisions, incompatible catalogs, parser/dispatcher preservation and byte-reproducible artifacts across two independent staging directories.

Semantic tests reproduce the 33 selected baseline comparisons and retain two strict differences separately: NEIGHBORS ordering and SOLO API-call traces. The earlier full behavioral-equivalence acceptance remains **FAIL**. Known-difference witnesses do not relabel it PASS, normalize ordering or change graph resolution.

Duplicate-slug fixtures retain four executions plus four uninstrumented controls. They demonstrate that site-group order changes the unqualified `find(slug)` graph target, even when EXTRACT and selected roots agree. Role WALK still builds Wiki-neighborhood projections, not typed-Discourse projections. The site-resolution policy remains undecided.

Browser tests preserve independent T1–T9 and the 35 scratch checks, unique-slug command fixtures, real DOM status/reset and a trusted Solo receiver. Requests are fulfilled from trusted local fixtures; unexpected requests are aborted, service workers are blocked and profiles are disposable. Only experiment-owned browser processes are launched/closed. No public Wiki page, untrusted JavaScript or remote CODE import is executed.

## Authorization and deployment boundaries

The tested CODE guard accepts any truthy `initiator`, or an owned non-remote page. It is invocation gating, not a JavaScript sandbox. Page author/import trust, session-origin JavaScript access and nested execution authorization require review before production adoption.

See docs/ward-listen-experiment.md for Ward's separate temporary LISTEN evidence and its conditional authorization consequence. It is not implemented here and is not called a verified current behavior or exploit.

Root npm dependencies, Nix derivations, host package selection, deployment, production Solo compatibility, duplicate-slug policy, new graph projections and migration all remain outside this module slice. Upstream updates follow Observe → Compare → Test → explicit Accept/Defer/Reject; no automatic pin promotion occurs. A successful build or browser run authorizes none of those later actions.

## Review corrections and retained acceptance

EDGES now treats a site-qualified destination as a Wiki authority plus slug. This follows the locally inspected Wiki client 0.31.6's `lib/neighborhood.js` (`location.host`) and `lib/siteAdapter.js` (`//${site}/favicon.png`, localhost ports) and the extension's `site+slug` identity and `//site/view/encodedSlug` navigation. A site is not a complete URL, userinfo, path, query or fragment. Browser-parsed host authorities (including DNS/IDN names, localhost and IP literals) and optional numeric ports are supported; delimiters, controls, malformed hosts/ports and alternate numeric-host spellings that URL parsing would reinterpret are rejected. This checks authority syntax and identity-preserving parsing, not DNS-label policy, destination trust or reachability. Valid authorities retain protocol-relative navigation; unqualified slugs retain `/view/` navigation. Slugs are URI-encoded; text-node and quoted-attribute escaping are separate. Invalid destinations remain in the recorded edge data and display an inert diagnostic instead of a link. Renderer fixtures never execute adversarial data.

The browser runner uses a fixed required-check inventory, not the set of checks that happened to execute. T1–T9, required individual checks, source integrity, offline request/error checks and actual context cleanup must all pass for exit zero. Context ownership is registered immediately after launch; failed navigation, bundle initialization and later initialization close that owned context before control returns. Close outcomes include actual close-event confirmation and failed attempts. A final owned-context sweep can finish cleanup without erasing a failed cleanup operation. No unrelated contexts are closed. Controlled faults are isolated harness inputs, not production behavior.

Additional regressions:

```sh
node test/renderer-safety.mjs --repository "$MECH_REPOSITORY" --dependencies "$MECH_DEPENDENCIES"
node test/acceptance-contracts.mjs
node test/evidence-retention.mjs
node test/browser-negative.mjs --repository "$MECH_REPOSITORY" --dependencies "$MECH_DEPENDENCIES" \
  --playwright "$PLAYWRIGHT_CORE" --browser "$BROWSER" --jquery "$JQUERY"
# Run the normal browser command again after negative runs, then explicitly retain the decision:
node scripts/record-acceptance.mjs --id unique-reviewed-decision-name
```

Each browser invocation retains a unique ignored `.artifacts/browser/run-*/results.json`; `.artifacts/browser/results.json` is only the latest diagnostic convenience. Compact decision records live in `evidence/acceptance/` and are authored source intended for version control, with no independent extension release OID. Tests do not write them. The explicit recorder refuses an existing name rather than overwriting a previous decision. The prior pre-correction acceptance is retained with its original content identity and its runner limitations, separately from corrected acceptance.

The execution-source digest excludes only `evidence/acceptance/` in addition to ignored build/tool directories: a record cannot include a digest that includes itself. Other authored files remain covered. Record bytes have their own file hashes in the full authored-file inventory; source-integrity checks still cover existing records. Tool inputs use named environment bindings in retained commands; optional generated diagnostics are relative paths and are not necessary to identify the tested sources, bundles or decision. No record implies reproducibility of a clean dependency installation or production runtime compatibility.

### Correcting the omitted duplicate-slug controls export

The saved ambiguity producer contract is `cases: 4`, `untracedControls: 4`, and four `results`, each carrying `tracingMatchesUninstrumented: true`. Its stdout-only `controls` field is not the saved-report contract. The recorder validates the count, distinct implementation/site-order pairs, paired-control comparisons and source revisions before serialization or creation of a decision record. The compact export retains four case summaries separately from the four-control count; separate uninstrumented output captures are not claimed.

`2026-10-09-review-corrections.json` omitted `ambiguity.uninstrumentedControls`. It remains unchanged. An explicit evidence-export correction can append a new record without claiming another browser execution:

```sh
# First rerun catalog/build, ambiguity and evidence-retention contracts with the current sources.
node scripts/record-acceptance.mjs --id new-control-export-correction \
  --supersedes 2026-10-09-review-corrections
```

This mode identifies the prior record by its content digest, retains its tested browser-source identity and marks browser observations as historical. It verifies current independently rebuilt profile artifacts against their actual bytes and the historical browser artifact identities, and checks the ambiguity run's composite identity. It does not transfer browser execution to the new recorder-source identity. The ordinary recorder still requires browser evidence for the current source identity. Full behavioral equivalence remains **FAIL** and the duplicate-slug policy remains undecided.
