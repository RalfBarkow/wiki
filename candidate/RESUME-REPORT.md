# P41 resumption report

Historical build/rehearsal record, before reconstruction-contract repair.
See [RECONSTRUCTION-REPORT.md](RECONSTRUCTION-REPORT.md) for the current
reconstruction proof and final pre-commit audit. The Git snapshot below records
the earlier stage and is intentionally preserved as history.

## A. Inherited worktree state

Resumed `/Users/rgb/workspace/p41-nix-candidate` in place, branch
`experiment/p41-nix-candidate`, HEAD
`96d3080fa10e259d6d4db71000ee25f4a5721b9d` (wiki 0.41.0-rc.3).
There was no result symlink or demonstrated artifact and no old build/fetch
process remained. The exact status listing and observed diff summary are in
[inherited-state.txt](inherited-state.txt). Unstaged: 2 files, +1/-8;
staged: 26 files, +6824/-1476. Existing source reconciliation was preserved.

## B. Previous terminal failure

The last custom-cache derivation failed in Python `urllib.request.urlopen`:

```
ssl.SSLCertVerificationError: [SSL: CERTIFICATE_VERIFY_FAILED]
certificate verify failed: unable to get local issuer certificate (_ssl.c:1032)
urllib.error.URLError: <urlopen error [SSL: CERTIFICATE_VERIFY_FAILED] ...>
```

The failed cache derivation was
`/nix/store/xbx5jyb4rpapk6ccdn07qh6ki8q4cvs1-p41-npm-deps.drv`, exit 1;
its dependent wiki derivation consequently failed. The log was reread directly
with `nix log`, saved as `/tmp/p41-prior-cache-failure.txt`.
This is distinct from the earlier `fetchNpmDeps` error rejecting
`file:///candidate/packages/wiki-client.tgz: invalid format` and from a
subsequent filtered-cache attempt that stalled and was cancelled. No success
was inferred from either incomplete attempt.

## C. Standard Nix versus custom cache

Standard primitives are sufficient. At nixpkgs
`5e2305d577ca00acbba631b05cb1094d172b29f3`,
`pkgs/build-support/node/import-npm-lock/default.nix` provides
`packageSourceOverrides`; its fetchModule uses `fetchurl` with
`url = module.resolved; hash = module.integrity` for registry URLs.
The corresponding `hooks/npm-config-hook.sh` installs store-path-rewritten
manifests and later restores the original coherent manifest/lock.

The standard hook defaults to offline `npm install`. The final flake appends a
fail-fast substitution to the hook's **buildCommand** to require
`npm ci --offline --ignore-scripts`. Its Node inputs are explicitly Node 22.
This preserves the standard URL translation and restoration machinery.
The custom fetch-cache.py and obsolete filtered-lock helper were removed.
There is no private cacache writer, guessed cache format, or placeholder hash.

An initial override incorrectly used postFixup, which makeSetupHook's
runCommand does not execute. Inspection of the actual built hook caught this:
that first successful artifact used offline npm install. It is superseded by
the corrected offline-ci artifact below. The corrected artifact was rebuilt
and its smoke test repeated; the first result is not the delivered candidate.

## D. Final fetching and graph

One complete lock: 544 package entries, 494 unique HTTPS registry.npmjs.org
archives with SRI, and five fixed local server/client/plugin archives.
URL/integrity duplicates agree; local archives are Nix path inputs, not remote
fetches. Standard fetchurl verifies registry content against lock SRI.
No dependency graph is overlaid after installation. The build checks component
manifests, resolved dependency semvers, all Node engines, and absence of nested
wiki runtimes. See graph-report.json and embedded share/p41/graph-report.json.
Node is 22.23.3, pinned through the nixpkgs revision above.

## E. Artifact and provenance

Final build: **exit 0**. Result symlink resolves to:

`/nix/store/qj488bdrnfchi2w27i0ylys4xbqlx0vk-wiki-p41-0.41.0-rc.3`

See artifact-report.json for the manifest versions,
actual installed hook, client bundle stamp, and source/archive verification.
The successful requested build command is:

```
nix build .#default --out-link result -L
```

Provenance is embedded at `share/p41/provenance.json` and
`lib/node_modules/wiki/p41-provenance.json`. It records the exact meta commit,
upstream and personal component commits, archive SHA-256 values, plugin pins,
Node and nixpkgs. The executable pins Node through its store interpreter.
The client bundle additionally contains its upstream commit plus archive hash.
Wrapper revision variables label the reconciled server/client; the embedded
provenance supplies full identities including personal sources.

| Component | Selected identity |
|---|---|
| wiki | 0.41.0-rc.3 / 96d3080fa10e259d6d4db71000ee25f4a5721b9d |
| server | 0.28.0 / 6e8d4e1433da6773016ca35641b797453a667ff0 + personal b8a5f36907a35e64d338bf21351fd89226b41bed |
| client | 0.33.0 / d59dbd68c2a539d32add72e06d2fd74e9d6d60c2 + personal f3c72d9fc31a3db8a296c7f2d05b36364395e4fe |
| friends / passportjs / social | 0.3.1 / 0.14.0 / 0.1.0 |
| mech | 0.1.32-dev.1 / 4b8051417dec6b0eff40878290a703b1fa60fb52 |
| solo | 0.1.30-1 / 3ad7796217d564407fd36cf62c37844654fdc967 |
| journalmatic | 0.2.3 / 29bd58246fa4043b1808d1e26bd6bf9df15fc952; personal About metadata from aa5f5863bb8de8f697815b405cfb2f1a0e055ed9 |

Journalmatic retains 0.2.3 attribution checks; only the personal About page and
factory entry were carried forward. No wiki ^0.39.1 dependency remains.
All bundled plugin manifest versions are in artifact-report.json.

## F. Platform classification

The built and rehearsed artifact is **x86_64-darwin**. The intended production
target is **x86_64-linux**. The final flake evaluates successfully for Linux;
platform-report.json records its derivation:
`/nix/store/fcm66qa05ndlhw7rr04dx9071x95i1h7-wiki-p41-0.41.0-rc.3.drv`. Evaluation is not a Linux build
or runtime test. A Linux builder/VM build and equivalent isolated rehearsal are
the next platform gate. The Darwin result is not deployable to NixOS.
Pinned nixpkgs also warns that 26.05 is its last x86_64-darwin release.

## G. Existing proxy test evidence

The existing log `/tmp/p41-proxy-tests.log` was read, not rerun unnecessarily.
Command (cwd the candidate worktree):

```
/usr/bin/sandbox-exec -f /tmp/p41-loopback.sb /nix/store/4418mibqll9d99bsh1zz0xm5vm7pwcdl-nodejs-22.23.3/bin/node --test /Users/rgb/workspace/p41-nix-candidate/node_modules/wiki-server/test/proxy.js
```

**4 tests, 1 suite, 4 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo**;
5266.945782 ms. These exercised reconciled personal code: HTTPS-to-HTTP
fallback with query/header handling, non-loopback fallback planning, slow JSON
buffering beyond two seconds, and public-origin loopback rejection (403).
The final artifact smoke additionally exercised anonymous HTTP fallback,
buffered JSON and header filtering through a local fixture under the stronger
final runtime sandbox.

## H. Synthetic farm

Final smoke command exited **0**, with every reported check PASS.
smoke-report.json records the final run and scratch paths. The farm used port
56332 and scratch root `/var/folders/y1/yhhpj5wd7cb5325t8__1ct2r0000gn/T/p41-smoke-xoHc5b`. Only synthetic pages,
commons and disposable friends owner/session state were used. Farm=true,
security_type=friends, explicit scratch data/commons, alternate loopback port,
isolated HOME/cwd/tmp, alpha.localhost and beta.localhost allowlist.
No copied production authority, production links or mounts.

The kernel sandbox denies external IP egress; a TEST-NET TCP probe must return
EPERM before server start. It allows loopback IP and local Unix socket IPC for
Chromium and denies reads/writes of both real .wiki paths. Wiki and Chromium
inherit that profile. Browser requests also have an explicit local-origin
allowlist. The initial broader profile failed its denial test and was corrected
before relying on it; Chromium's Unix socket allowance was then added explicitly.

A-M smoke coverage passed: startup, routing, friends claim/protected access,
client bundle, ordinary browser-rendered page, optional plugin discovery, mech
and solo browser registration/assets, journalmatic module initialization,
installed page.merge return, installed optional-index 404 caching, scratch
isolation, and restart persistence of page/owner/session. Mech also read scratch
commons and its server route executed. Browser reported no page errors.
The Nix build independently passed all 112 client tests and preserved colon
normalization and merge behavior. All owned runtime processes were stopped. The successful final build log is
`/tmp/p41-nix-build.log` (also `/tmp/p41-offline-ci-build.log`); final smoke log is
`/tmp/p41-smoke-final.log`.

Limits: mech/solo loading is tested, not every interaction. Map and math were
not rendered. Installed map requests Leaflet from unpkg, extensions from
jsdelivr and default OpenStreetMap tiles; math loads KaTeX 0.18 JS/CSS from
jsdelivr. These external resources were not allowed through the rehearsal.
No real wiki site was needed.

## I. Reconciliation and diff

Complete upstream-to-candidate patches are wiki-server.patch, wiki-client.patch
and wiki-plugin-journalmatic.patch; production-*.patch preserves attribution.

| Personal behavior | Source / target | Reconciliation and result |
|---|---|---|
| Loopback guard | server b8a5f369; lib/server.js | Clean; public site blocks loopback proxy targets |
| HTTPS-first / fallback | same, proxy handler | Clean; HTTP fallback after HTTPS transport failure, not HTTP error status |
| Proxy authorization | same, proxy handler | Clean; anonymous proxy retained; protected friends routes remain protected |
| Header filtering | same, proxy handler | Clean; content-type/cache-control/etag/last-modified allowlist |
| Timeouts / partial response | same, proxy handler | Clean; 8s remote / 20s JSON/plugin / 2s image; buffered JSON and failure handling retained |
| Optional CSP | server b8a5f369; defaultargs.js + server.js | Clean; opt-in CSP and origin-dependent connect-src retained; default-off smoke |
| Loopback / provenance | client f3c72d9; networkSecurity.js, pageHandler.js, siteAdapter.js | Clean; public-origin policy and provenance filtering retained |
| Failed-route cache / optional index | same, siteAdapter.js | Clean; failed-prefix cache and one-time missing-index handling retained |
| DOM adapter | same, dom.js, legacy.js, future.js | Clean; personal adapter retained; ordinary page browser smoke passed |
| Revision stamps | same, build-client/testclient scripts | Personal change clean; candidate manually adds explicit immutable revision/time inputs |
| Personal test entrypoint | client/runtests.html, testclient.js | Manual reconciliation for upstream jQuery 4 script lines; jQuery-free personal entry retained |
| Optional plugin discovery | server.js, page.js, plugins.js | Candidate source reconciliation: merge dependency lists in all four consumers; replace stale require.main lookup with loaded manifest |

Optional discovery is needed because mech/solo are optionalDependencies and
upstream dependency-only discovery excludes them. Fixing the actual source
before packaging avoids post-install substitutions. Upstream page.merge return
and trailing-colon normalization remain intact.

Action/write semantics were not changed. The preserved source audit confirms
the action handler and page I/O/queue match server 0.28.0. Same-page concurrent
lost update, stale edit acceptance and missing-item edit journalling remain.
No consistency fix or reproduction workload was added.

Final diff/stat and status are recorded below after all report files are staged.
Patch files contain meaningful unified-diff context lines with single spaces;
git diff --check warnings for those lines are not source whitespace edits.

## J. Final status and proposed boundary

HEAD remains the exact rc.3 commit; no commit, push, SSH, production data access,
service restart or deployment was performed. The original meta/server/client
checkouts remain unchanged. Build/smoke processes have exited.

Proposed single commit boundary: **Build isolated P41 baseline with reconciled
personal sources, standard Nix lock transport, and synthetic farm evidence**.
It includes the locked composition, five fixed source archives and readable
patches/manifests/provenance, flake, graph/build checks, smoke harness and reports.
It excludes Linux deployment, copied production authority, and write-consistency
fixes. Stop before committing.

## Final Git snapshot

`git diff --stat HEAD`:

```text
 .gitignore                                         |    5 +
 .npmignore                                         |    4 +
 candidate/README.md                                |   51 +
 candidate/RESUME-REPORT.md                         |  293 ++
 candidate/artifact-report.json                     |  115 +
 candidate/assemble.py                              |   47 +
 candidate/build.mjs                                |   27 +
 candidate/check-graph.mjs                          |   38 +
 candidate/graph-report.json                        |  196 +
 candidate/inherited-state.txt                      |   45 +
 candidate/packages-manifests/wiki-client.json      |   69 +
 .../wiki-plugin-journalmatic.json                  |   16 +
 candidate/packages-manifests/wiki-plugin-mech.json |   55 +
 candidate/packages-manifests/wiki-plugin-solo.json |   45 +
 candidate/packages-manifests/wiki-server.json      |   79 +
 candidate/packages/wiki-client.tgz                 |  Bin 0 -> 649671 bytes
 candidate/packages/wiki-plugin-journalmatic.tgz    |  Bin 0 -> 11559 bytes
 candidate/packages/wiki-plugin-mech.tgz            |  Bin 0 -> 38467 bytes
 candidate/packages/wiki-plugin-solo.tgz            |  Bin 0 -> 14867 bytes
 candidate/packages/wiki-server.tgz                 |  Bin 0 -> 41692 bytes
 candidate/platform-report.json                     |    9 +
 candidate/production-client.patch                  | 2004 ++++++++
 candidate/production-server.patch                  |  368 ++
 candidate/provenance.json                          |   42 +
 candidate/proxy-report.json                        |   14 +
 candidate/smoke-report.json                        |   39 +
 candidate/smoke.mjs                                |  112 +
 candidate/source-audit.json                        |   12 +
 candidate/wiki-client.patch                        | 1994 ++++++++
 candidate/wiki-plugin-journalmatic.patch           |   42 +
 candidate/wiki-server.patch                        |  437 ++
 flake.lock                                         |   27 +
 flake.nix                                          |   74 +
 package-lock.json                                  | 5057 ++++++++++++++------
 package.json                                       |   30 +-
 35 files changed, 9870 insertions(+), 1476 deletions(-)
```

`git status --short`:

```text
M  .gitignore
M  .npmignore
A  candidate/README.md
A  candidate/RESUME-REPORT.md
A  candidate/artifact-report.json
A  candidate/assemble.py
A  candidate/build.mjs
A  candidate/check-graph.mjs
A  candidate/graph-report.json
A  candidate/inherited-state.txt
A  candidate/packages-manifests/wiki-client.json
A  candidate/packages-manifests/wiki-plugin-journalmatic.json
A  candidate/packages-manifests/wiki-plugin-mech.json
A  candidate/packages-manifests/wiki-plugin-solo.json
A  candidate/packages-manifests/wiki-server.json
A  candidate/packages/wiki-client.tgz
A  candidate/packages/wiki-plugin-journalmatic.tgz
A  candidate/packages/wiki-plugin-mech.tgz
A  candidate/packages/wiki-plugin-solo.tgz
A  candidate/packages/wiki-server.tgz
A  candidate/platform-report.json
A  candidate/production-client.patch
A  candidate/production-server.patch
A  candidate/provenance.json
A  candidate/proxy-report.json
A  candidate/smoke-report.json
A  candidate/smoke.mjs
A  candidate/source-audit.json
A  candidate/wiki-client.patch
A  candidate/wiki-plugin-journalmatic.patch
A  candidate/wiki-server.patch
A  flake.lock
A  flake.nix
M  package-lock.json
M  package.json
```

All listed changes are staged for review; nothing was committed.
