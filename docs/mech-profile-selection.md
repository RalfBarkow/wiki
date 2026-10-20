# Explicit shared Mech profiles for dreyeck.ch

The unchanged default `wiki` recipe remains the declared branch base. Its core/client/server, Solo, Code and Journalmatic selections are not replaced. New `mech-upstream`, `mech-discourse`, `wiki-upstream` and `wiki-discourse` outputs consume the single shared composition source at RalfBarkow/wiki `9a9afef387e8c05587c95171119d627117798f56` (module source `971794d2066f87f63e7685447352340d5276a959`). Upstream Mech stays pinned to a028b4bba04e539dcaa090423d38a00a0050489d; Discourse adds EXTRACT/EDGES/DEBUG and guarded role WALK. No extension source is copied into this branch.

This source commit is local/unpublished in the current task. Local verification uses an explicit `--override-input mech-composition git+file:///path/to/wiki?rev=9a9afef387e8c05587c95171119d627117798f56 --no-write-lock-file`; the authored lock retains repository authority/full OID/NAR hash, never a development-machine pathname. Publish/push the dependency separately before expecting a remote GitHub fetch to succeed.

Build `nix build .#wiki-upstream` or `.#wiki-discourse` after the shared source is available. Select the exact package through the existing host service/package interface; the default `wiki` is not changed here. Preserve each process/farm's package-root boundary; hostnames do not independently select plugins. Active server state and the hyperdoc Wiki profile remain unknown/undecided. The Lisp HyperDoc deployment is separate.

For later rollback, restore the prior branch/input revision and selected package/generation; `wiki` retains the old declared recipe. No push, service selection, activation or deployment was performed. Full behavioral equivalence remains FAIL. The newer client intentionally blocks public-origin localhost acquisition and strips loopback provenance; the older Dreyeck client differs. This is an independent client policy, not resolved by choosing Mech. Production CODE trust, HTTPS/local-network access, authentication and Solo compatibility require separate deployment evidence. Detailed package source/asset/fixture/test identities live in the pinned shared source's docs/mech-profile-acceptance.json. Independent fork evidence is retained separately at RalfBarkow/wiki development commit 4dd6be43453b451615ce04fc9ac4e5792eede46e, docs/wiki-fork-contract.md and docs/wiki-fork-acceptance.json; it is not included in the package-library pin 9a9afef387e8c05587c95171119d627117798f56. The localhost recipe acquires the controlled local source but strips journal provenance; it does not share P41's acquisition rejection.

## 2026-10-20: composition with TRAVERSE

This section supersedes the composition pin named above; the paragraphs above are kept as written. The `mech-composition` input now names RalfBarkow/wiki `a83c3e0d6662a10af000696fc3f1401524cef818`. That commit pins the module commit `1dbedae7b776ca38c36dc04302796be7a07b9371`, content `457b7e39…`, which adds TRAVERSE to the discourse profile. Ward's Mech stays at `a028b4b`; Ward's WALK and the role WALK are unchanged.

Only the `mech-composition` input and its lock node changed in this branch.
- **Default `wiki`:** keeps its outputs, x86_64-linux `/nix/store/idhgz3kwwj5z24s6kdazsggdgjqngri3-wiki-0.39.2`, the package production runs.
- **`wiki-discourse`:** evaluates to `/nix/store/ka7nw9n09d1iqqk2in7v9pdbskdf1qb7-wiki-dreyeck-discourse-0.39.2`. Its derivation equals the default `wiki` apart from the name, an appended Mech install step and the Mech input. Its `client/mech.js` is `19b14c31c62f0ce92c4ecaacf78477b230d83f0fdefea48033128cb575190efd`, the bundle tested end to end (AT-9). Solo stays `0.1.30-1`.
- **Upstream profile:** its bundle bytes are unchanged (`db6f746b…`); its store paths changed with the module source.

Identities and checks are in `docs/mech-profile-consumer-acceptance-traverse.json`. The x86_64-linux packages were evaluated, not built: no Linux builder was available. The first Linux build must produce the store path above and that `mech.js` hash.

Switching the farm from the deployed fork `abd88d2` to this package changes more than TRAVERSE: CODE becomes available, NEIGHBORS ordering changes, and COMMONS returns file names. These are acceptance conditions for the deployment, not settled by this build.
