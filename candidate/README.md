# P41 source and reconstruction contract

P41 starts at wiki `96d3080fa10e259d6d4db71000ee25f4a5721b9d`
(0.41.0-rc.3). The normal artifact remains the already rehearsed composition.

```
source-inputs.json: exact source identities + URLs + SHA-256 SRI
  -> Nix reconstructionSources (fetchurl, immutable store paths)
  -> canonical candidate reconciliation patches
  -> assemble.py: verified package trees + deterministic archives
  -> package-lock.json / importNpmLock / offline npm ci
  -> Nix wiki artifact with embedded provenance
  -> isolated synthetic farm rehearsal
```

`vendor/` has no role in this procedure. No mutable checkout, existing package
archive, node_modules, production configuration or production authority is
needed to reconstruct the archives. Network retrieval, when needed, is through
Nix fetchurl with explicit content hashes. Once those store inputs are cached,
reconstruction works offline.

## Source authority

Full revision IDs, source archive URLs and hashes are in `source-inputs.json`.
Expected packaged archive hashes remain in `provenance.json`.

| Package | Base authority | Personal attribution / reconciliation |
|---|---|---|
| wiki-server 0.28.0 | fedwiki Git commit 6e8d4e1433da6773016ca35641b797453a667ff0 | RalfBarkow b8a5f36907a35e64d338bf21351fd89226b41bed; wiki-server.patch |
| wiki-client 0.33.0 | fedwiki Git commit d59dbd68c2a539d32add72e06d2fd74e9d6d60c2 | RalfBarkow f3c72d9fc31a3db8a296c7f2d05b36364395e4fe; wiki-client.patch |
| journalmatic 0.2.3 | fedwiki Git commit 29bd58246fa4043b1808d1e26bd6bf9df15fc952 | About metadata from aa5f5863bb8de8f697815b405cfb2f1a0e055ed9; wiki-plugin-journalmatic.patch |
| mech 0.1.32-dev.1 | RalfBarkow Git commit 4b8051417dec6b0eff40878290a703b1fa60fb52 | No source reconciliation |
| solo 0.1.30-1 | Exact published npm tarball, SHA-256 pinned in source-inputs.json | Published gitHead 3ad7796217d564407fd36cf62c37844654fdc967; no source reconciliation |

Solo's published gitHead is recorded for attribution, but that object is not
available from the upstream or personal GitHub archive endpoints (404). The
hash-verified, exact published npm tarball is its reconstruction authority. Its
npm integrity and gitHead were checked against that version's registry metadata.
This reconstructs the selected published package, including its bundled assets;
it does not claim to rebuild solo's published JavaScript from an unavailable Git
object. The resulting P41 package archive is nevertheless byte-identical.

The source files of server/client are reconciled before npm resolution. No
post-install source overlay occurs. Journalmatic retains upstream 0.2.3 code,
including attribution checks, and adds only the personal About page/factory
entry. Its canonical comparison also represents npm packaging's omitted
.gitignore. There is no wiki ^0.39.1 dependency. Mech is bundled later with its
unchanged source pin and compatible esbuild 0.25 toolchain.

## Reconstruct in Nix

From a checkout containing this flake:

```sh
nix build .#reconstruct --out-link reconstructed
mkdir -p candidate/packages
cp reconstructed/packages/*.tgz candidate/packages/
nix build .#default --out-link result -L
```

Use a temporary out-link if keeping the checkout free of extra links is desired.
`reconstruct` does not read `candidate/packages/`, even if those files exist.
It uses only the explicit reconstruction description and pinned source inputs.
Its output includes `reconstruction.json` with source, patch, package-tree and
archive checks. Its Python 3.13 and Git toolchain comes from pinned nixpkgs
`5e2305d577ca00acbba631b05cb1094d172b29f3`; runtime Node remains 22.23.3.

For an explicitly executed reconstruction in a fresh directory, use Nix's build
environment (the output path printed by the first command is the sources path):

```sh
nix build .#reconstructionSources --no-link --print-out-paths
nix develop .#reconstruct --command python candidate/assemble.py \
  --sources /nix/store/REPLACE-WITH-PRINTED-SOURCES-PATH \
  --output candidate/packages --report reconstruction.json
```

The alternative direct CLI is `python3 candidate/assemble.py`, requiring Python
3.13+, Git and Nix on PATH. Without --sources it asks Nix for the pinned source
set. Output defaults to candidate/packages relative to the current directory.
The pinned Nix command above is the reference implementation; a different Python
or zlib version must still pass the exact expected archive hashes.

## Patches and assembly

The three `wiki-*.patch` files are **reconstruction inputs**. They encode the
complete upstream-to-candidate source/package-tree reconciliation, including
build stamps and optional plugin discovery. The two `production-*.patch` files
are **provenance evidence only**, generated from these exact ranges:

- server: ec3527abf0d1c1e1929272d580a80905c1dbf381 -> b8a5f36907a35e64d338bf21351fd89226b41bed
- client: 3f61a4862703f492b0d6bfb8695bd665b943bb38 -> f3c72d9fc31a3db8a296c7f2d05b36364395e4fe

The production-server evidence faithfully includes an old development flake
with a machine-local repomix-tools path. That is historical evidence, not a P41
input: the assembler never evaluates either personal repository's flake or
.envrc. Only this repository's pinned P41 flake is evaluated.

Assembly validates the production evidence against the two pinned personal
source trees. It never stacks production patches onto the candidate patches.
All five patches are canonical Git full-index, zero-context diffs. Zero context
avoids literal single-space blank context lines inside stored patch files; those
caused the earlier outer git diff --check warnings even in canonical patches.
No source whitespace was changed and no whitespace checks were suppressed.
EOF-without-newline is represented by Git's standard marker.

The intended validation/application commands, in the relevant extracted base,
are `git apply --unidiff-zero --whitespace=error-all --check PATCH` and then
`git apply --unidiff-zero --whitespace=error-all PATCH`. Base archives are
SHA-256 checked before application. The assembler performs these checks itself.

To regenerate comparisons, create a temporary pair of directories named `a`
and `b`: the pinned base and the reviewed reconciled result. Exclude package
locks for candidate comparisons; keep complete trees for production evidence.
Run from their parent:

```sh
git diff --no-index --no-prefix --no-ext-diff --no-renames \
  --binary --full-index --unified=0 a b > candidate.patch
```

Git exits 1 when the trees differ. Never regenerate patches by concatenating
line-based diff fragments: that lost the journalmatic EOF boundary previously.

Assembly extracts only hash-verified source inputs into fresh temporary trees,
applies candidate patches, checks journalmatic metadata against its personal
pin, and compares normalized source trees with package-trees.json. It excludes
package-lock.json, .git and node_modules, sorts entries, normalizes executable
modes, uses package/ paths, fixed uid/gid and timestamp 1, PAX tar format, and
gzip level 9 with timestamp 0. Every archive SHA-256 must match provenance.json
before any output archive is published. No manifest/provenance rewriting occurs.

## Checked-in generated material

- `packages/*.tgz`: the five exact **Nix/npm build inputs**, retained so normal
  builds need no source-reconciliation tooling or source downloads.
- `packages-manifests/*.json`: readable dependency declarations for graph checks.
- `package-trees.json`: expected relative paths, normalized modes and file hashes,
  independently captured from the rehearsed inputs; verification evidence, not
  source content. Reconstruction cannot derive missing source bytes from it.
- `wiki-*.patch`: generated, reviewed comparisons that are reconstruction inputs.
- `production-*.patch`: generated attribution evidence, also application-checked.
- `provenance.json`: source identities and expected archive digests, embedded in
  the resulting runtime artifact. `source-inputs.json` additionally pins source
  transport bytes, including personal/evidence bases.
- JSON/Markdown reports: historical build/rehearsal and current reconstruction
  evidence. They are excluded from the runtime source fileset. Earlier reports
  describe the stage at which they were written; RECONSTRUCTION-REPORT.md records
  the latest audit.

## Normal build and rehearsal boundary

`importNpmLock` uses standard SRI-checked fetchurl for registry dependencies and
packageSourceOverrides for the five local archives. Its standard transport hook
is adapted to execute `npm ci --offline --ignore-scripts`; original manifests
and lock are restored afterward. No custom cacache implementation is retained.
`check-graph.mjs` verifies engines, component dependencies and absence of nested
wiki runtimes; `build.mjs` builds bundles and runs focused tests.

`smoke.mjs <store-path>` is the already proven Darwin synthetic farm harness:
separate HOME/cwd/data/commons, friends security, two synthetic hosts and
loopback fixtures. Wiki and Chromium use an OS sandbox with external IP egress
blocked and real .wiki paths denied; the EPERM probe verifies that denial.
No production authority is copied. The reconstruction refactor changes no
runtime source bytes, so its proof is artifact/content comparison rather than
another farm run. Linux deployment and Action/write-consistency fixes remain
outside this slice.
