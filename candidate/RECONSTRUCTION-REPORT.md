# P41 reconstruction verification

## A. Resumed state

HEAD: `96d3080fa10e259d6d4db71000ee25f4a5721b9d`.
Branch: `experiment/p41-nix-candidate`.
Repair edits were present and staged: 37 files, +11057/-1476. No unstaged
changes were present. `.DS_Store` was the only untracked file and was left
untouched. No patches were regenerated during this final verification.

Exact resumed status:

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
A  candidate/package-trees.json
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
A  candidate/source-inputs.json
A  candidate/wiki-client.patch
A  candidate/wiki-plugin-journalmatic.patch
A  candidate/wiki-server.patch
A  flake.lock
A  flake.nix
M  package-lock.json
M  package.json
?? .DS_Store

```

## B. Five archive reconstruction results

| Archive | Expected SHA-256 | Reconstructed SHA-256 | Byte-identical | Normalized tree equal |
|---|---|---|---|---|
| wiki-server | `1b17048869c3a3313dcea6766b15a94b5cce9c803979ebd48850e902202c876e` | `1b17048869c3a3313dcea6766b15a94b5cce9c803979ebd48850e902202c876e` | YES | YES |
| wiki-client | `70237aa59f7f29c1ae29eaca0da5434b39e74765b6fd6083b76786330dbb5b15` | `70237aa59f7f29c1ae29eaca0da5434b39e74765b6fd6083b76786330dbb5b15` | YES | YES |
| wiki-plugin-journalmatic | `4b55578f0dc578812433ec918ba52b67bf3a97f8da9e9a066914ccf83910839d` | `4b55578f0dc578812433ec918ba52b67bf3a97f8da9e9a066914ccf83910839d` | YES | YES |
| wiki-plugin-mech | `3164e097fd30dc1185b90a1f481e2d899645d87981f3dcb68982c6fa4a44b1d9` | `3164e097fd30dc1185b90a1f481e2d899645d87981f3dcb68982c6fa4a44b1d9` | YES | YES |
| wiki-plugin-solo | `0d63486478ad61bcb942f8e68be01364fa0c3cc64be369597fe931656a931ed9` | `0d63486478ad61bcb942f8e68be01364fa0c3cc64be369597fe931656a931ed9` | YES | YES |

All five archives are unchanged, including server and solo. There is no
remaining nondeterministic archive metadata discrepancy. Full machine-readable
results are in reconstruction-report.json. The assembler verified ten source
hashes and application of all five canonical patches as part of this run.
The prior archive-content comparison was not repeated as a separate research
exercise; these are the checks performed by the durable reconstruction command.

## C. Fresh-snapshot build

Exported the exact resumed index with `git checkout-index --all --prefix=.../`
into a new temporary directory. Removed all five candidate/packages/*.tgz
before reconstruction. No vendor tree, source checkout, or node_modules was
provided. The temporary directory was:
`/private/tmp/p41-final-falsification-jccv0iwq/snapshot`.

The documented commands executed there were:

```sh
nix build .#reconstructionSources --no-link --print-out-paths
nix develop .#reconstruct --command python candidate/assemble.py   --sources <the Nix source-set path printed above>   --output candidate/packages --report ../reconstruction.json
nix build .#default --out-link result -L
```

Both reconstruction and ordinary build exited **0**. The result symlink resolves
to the exact previously rehearsed artifact:

`/nix/store/qj488bdrnfchi2w27i0ylys4xbqlx0vk-wiki-p41-0.41.0-rc.3`.

This is x86_64-darwin. No Linux build/deployment was attempted. Reusing the
cached realization of the identical normal derivation avoided rerunning the
112 tests and farm rehearsal unnecessarily; those prior results still apply.
The snapshot's graph checker was separately executed against the immutable
result, using semver from pinned Node/npm, and passed: 544 packages, all Node
engines satisfied, no nested wiki. Its report equals the embedded graph report.
All installed component manifests and both provenance copies match.

## D. No hidden source dependency

The snapshot contained only indexed files at export. Its package archives were
withheld until assembly recreated them. Reconstruction reads source bytes only
from `reconstructionSources`, whose ten fetchurl inputs have exact SHA-256 SRI
pins in source-inputs.json. The Nix reconstruction derivation's source fileset
explicitly excludes vendor and package archives. The assembler reads the
reconstruction patches, package-tree digests and provenance expectations, never
pre-existing generated archives.

`package-trees.json` supplies expected hashes/modes, not missing source bytes.
Every output archive is generated from pinned source content and validated
against that independent description and its original archive hash before
publication. Temporary paths in this report identify test evidence, not inputs.
A future checkout needs committed files, Nix and access to the pinned external
inputs (or their Nix cache). Python/Git come from the same pinned nixpkgs.
No original worktree, mutable personal checkout or manually prepared tree is
needed. The README procedure was executed successfully as documented.

Solo's recorded published gitHead cannot be retrieved from either GitHub
archive endpoint. Its explicit authority is the exact published 0.1.30-1 npm
tarball, SHA-256 pinned and registry integrity/gitHead recorded. This reconstructs
that published package exactly, including its bundled JavaScript. It does not
claim to rebuild the published bundle from the unavailable Git object.

## E. Runtime equivalence and preserved boundary

All five archive bytes and normalized trees match the established inputs.
The normal result is the same immutable Nix store object, so installed runtime
content is identical, not merely semantically similar. Meta/server/client,
friends/passport/social, mech/solo/journalmatic identities and provenance remain
those in artifact-report.json and provenance.json. No source/build-input change
required repeating the synthetic farm rehearsal.

The preserved source-audit.json still records:

- action handler identical to server 0.28.0;
- page I/O and queue identical to server 0.28.0;
- same-page concurrent lost update, stale edit acceptance, and missing-item
  edit journalling intentionally remain;
- no consistency fix added.

No production access, SSH, push, production authority copy, service change,
Linux deployment or new runtime feature was performed.

## F. Documentation

README.md now documents the full pinned-source -> reconciliation -> deterministic
archive -> importNpmLock -> Nix artifact -> synthetic rehearsal sequence, exact
source identities and source/evidence/archive authority distinctions. It gives
both the Nix reconstruction target and the explicitly executed CLI procedure.
The final verification required only a clarification that historical personal
server development-flake paths in production evidence are never evaluated.
The earlier RESUME-REPORT.md is now clearly marked as a historical record.

Production patches are evidence only: they are validated on their exact pinned
production bases and compared with personal source trees. Candidate patches are
reconstruction inputs. Both are canonical zero-context full-index Git diffs;
`git apply --unidiff-zero --whitespace=error-all --check` is their intended
validation. Git now preserves journalmatic's missing-newline state explicitly.
No global or per-file whitespace suppression was introduced.

## G. Final pre-commit audit

- `git diff --cached --check`: **CLEAN (exit 0)**.
- All five reconstruction/evidence patches: **VALID**, confirmed during fresh
  reconstruction; no regeneration during this resumed verification.
- All five archives: **RECONSTRUCTIBLE and byte-identical**.
- Fresh archive-free snapshot: **no vendor dependency; reconstructs and builds**.
- No required unstaged or untracked file. `.DS_Store` remains unrelated/untracked.
- Staged text and text inside all five archives were scanned. No credential or
  copied owner/reclaim/OAuth authority was identified. Sensitive-term matches
  are synthetic smoke state/redaction, random-secret generation, library code,
  dependency names and documentation.
- Active reconstruction logic (assemble.py, flake.nix, source-inputs.json) contains
  no machine-local source path or production authority path.
- Harmless path strings remain in historical build/smoke/proxy reports, the
  smoke harness's explicit production-path denials/assertions, an upstream
  defaultargs test fixture, and production-server.patch's old repomix-tools
  development input. The latter is applied as text for evidence validation but
  its flake/.envrc is never executed or evaluated. It is absent from the runtime
  candidate. No production authority data is staged.

After documentation/evidence staging, a second clean index-only snapshot build
also verifies the final index independently. The reconstruction and normal
runtime source filesets are unaffected by these report/documentation additions.

## H–I. Final staged diff and status

Recorded in the final Git snapshot below. All intended candidate files are
staged. Nothing was committed.

## J. Proposed commit boundary

The reconstruction blocker is resolved. The focused P41 baseline commit boundary
is now justified: exact sources, canonical reconciliation/evidence, deterministic
package inputs, standard Nix transport, pinned runtime, build/provenance checks,
synthetic rehearsal evidence and unchanged-write-semantics audit.

Proposed subject: `feat(nix): build isolated P41 fedwiki candidate`.

Stop before committing. Linux platform verification and write-consistency work
remain separate future slices. The x86_64-darwin nixpkgs support warning is
unchanged: the pinned release warns that 26.05 is its last supported release
for this architecture.

## Final Git snapshot

`git diff --cached --stat`:

```text
 .gitignore                                         |    5 +
 .npmignore                                         |    4 +
 candidate/README.md                                |  167 +
 candidate/RECONSTRUCTION-REPORT.md                 |  297 ++
 candidate/RESUME-REPORT.md                         |  298 ++
 candidate/artifact-report.json                     |  115 +
 candidate/assemble.py                              |  154 +
 candidate/build.mjs                                |   27 +
 candidate/check-graph.mjs                          |   38 +
 candidate/graph-report.json                        |  196 +
 candidate/inherited-state.txt                      |   45 +
 candidate/package-trees.json                       |  956 ++++
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
 candidate/production-client.patch                  | 1898 ++++++++
 candidate/production-server.patch                  |  663 +++
 candidate/provenance.json                          |   42 +
 candidate/proxy-report.json                        |   14 +
 candidate/reconstruction-report.json               |   77 +
 candidate/smoke-report.json                        |   39 +
 candidate/smoke.mjs                                |  112 +
 candidate/source-audit.json                        |   12 +
 candidate/source-inputs.json                       |   75 +
 candidate/wiki-client.patch                        | 1781 +++++++
 candidate/wiki-plugin-journalmatic.patch           |   55 +
 candidate/wiki-server.patch                        |  360 ++
 flake.lock                                         |   27 +
 flake.nix                                          |  100 +
 package-lock.json                                  | 5057 ++++++++++++++------
 package.json                                       |   30 +-
 39 files changed, 11441 insertions(+), 1476 deletions(-)
```

`git status --short`:

```text
M  .gitignore
M  .npmignore
A  candidate/README.md
A  candidate/RECONSTRUCTION-REPORT.md
A  candidate/RESUME-REPORT.md
A  candidate/artifact-report.json
A  candidate/assemble.py
A  candidate/build.mjs
A  candidate/check-graph.mjs
A  candidate/graph-report.json
A  candidate/inherited-state.txt
A  candidate/package-trees.json
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
A  candidate/reconstruction-report.json
A  candidate/smoke-report.json
A  candidate/smoke.mjs
A  candidate/source-audit.json
A  candidate/source-inputs.json
A  candidate/wiki-client.patch
A  candidate/wiki-plugin-journalmatic.patch
A  candidate/wiki-server.patch
A  flake.lock
A  flake.nix
M  package-lock.json
M  package.json
?? .DS_Store
```
