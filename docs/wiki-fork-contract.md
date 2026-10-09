# Independent Wiki fork contract

This test does not execute Mech and does not change Wiki client/server source, CORS, authentication or localhost proxy policies. The real installed client factory, lineup, UI fork action and server action route are used with disposable data and an explicit fixture security provider.

The destination-origin browser requests source content through `wiki.site(site).get`. For a successful ordinary fork it creates/holds a remote PageObject and invokes the normal `.fork-page` action. `pageHandler.put` obtains the source site from that PageObject, clones its raw page into `forkPage`, and `wiki.origin.put` sends an authenticated same-origin PUT with form-encoded `action` JSON. The server calls its security provider, consumes `forkPage`, saves the page and appends the fork source to the journal. It does not need to resolve the user's localhost when that complete snapshot is supplied. The legacy no-snapshot path calls remoteGet on the server; its localhost would mean the server's own loopback, not the user's workstation.

Source and destination are distinct authorities even when titles/slugs match. The fixture source has source-item; the destination has dest-item before copying. The remote PageObject is made with the actual `wiki.newPage(raw, site)` factory. Merely changing a DOM label was not accepted as remote identity evidence.

## Reproduce

```sh
node integration-tests/fork-browser.mjs \
  "$WIKI_ROOT" "$PLAYWRIGHT_CORE" "$BROWSER" dreyeck
# Use ralfbarkow or localhost for their distinct source-observed acquisition/provenance policies.
```

The Wiki root is a built lib/node_modules/wiki directory. Servers bind only loopback, use temporary page directories and are closed by the harness. The source `http://localhost:3000` is fulfilled by a disposable browser route; no request reaches or changes the user's live local Wiki. This proves the real client's site-adapter/protocol behavior with a controlled source, not public-network reachability to a live local service. The CORS-negative check uses a real distinct-origin local HTTP listener, because browser interception alone did not establish CORS enforcement. All fixture origins are localhost-resolved test domains; public-IP HTTPS Local Network Access and mixed-content behavior remain unverified.

The eight controls cover local source acquisition, a reachable non-loopback source, unavailable source, authenticated normal fork and journal provenance, loopback provenance from an explicitly preloaded snapshot, unauthorized server write/no remote mutation, real browser CORS rejection and a foreign-origin unauthorized write. The non-owner client API local-storage choice and the actual server 403 probe are reported separately; the test does not synthesize a permission button or claim production-login coverage. Fixture cookies are not real credentials; friends/passport provider strength is not tested.

## Observed results and remaining decision

- Older Dreyeck client: localhost:3000 source acquired in the trusted HTTP fixture; authorized fork and exact localhost source provenance preserved; rejected writes return 403 without changing remote data; CORS/foreign-origin failures observed.
- P41 / newer client: public-origin loopback acquisition rejected before any request. A preloaded loopback snapshot loses its site field through the existing shouldStripLoopbackProvenance rule. Authorized non-loopback fork, 403 denial and browser-origin/CORS controls still pass.
- Localhost recipe's resolved client acquires the controlled local source, but strips loopback journal provenance. This is a partial workflow result, separate from P41's rejection before acquisition. Its Image.onload favicon probe requires a valid PNG fixture; the initial harness error and corrected run are recorded separately.

The P41 intended public-origin localhost-to-remote workflow is **BLOCKED**; the localhost recipe is **PARTIAL** because it removes source provenance. Neither is relabeled successful because the negative controls pass. This is a client policy/transport decision, not a Mech compatibility error. No policy was weakened or normalized. The original browser operation uses the destination Wiki origin and its authenticated session; running the operation in the local Wiki origin normally writes to that local origin, not directly to a chosen remote server.

A future decision must reconcile the deliberate public-to-loopback prohibition with the desired transfer workflow, for example a separately authorized export/import transfer model. This slice introduces no localhost proxy or authentication/CORS workaround. Production source/destination authentication, HTTPS cookies, mixed content and Local Network Access require separate deployment evidence after a permitted workflow is chosen.

Raw structured fixtures/results, source identities, package/component versions and existing strict-equivalence failure are retained in the adjacent acceptance JSON and package-profile record. Active server state remains unknown; declared branch recipes were the source authority.
