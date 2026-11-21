# Draft for fedwiki/wiki-server: page requests wait behind start-up reads

Status: draft for an issue (and, if wanted, a pull request) in fedwiki/wiki-server. Not posted.

---

## Page requests wait behind the start-up sitemap and site-index reads

### What happens

On a site with many pages, the first request for a page after the server starts can take a long time. On a
site with about 28,000 pages the browser shows the page shell at once, but the request for the page JSON
(`/<slug>.json`) takes 15–70 seconds, depending on the machine.

### Why

At start-up the server builds the sitemap and the site index (`lib/server.js`, `running-serv` handler, lines
1013–1015 on `main` at 5ef646a, release 0.28.2):

```js
sitemaphandler.createSitemap(pagehandler)
searchhandler.startUp(pagehandler)
```

Both read every page through the page handler: `pagehandler.pages()` calls `itself.get()` for each file
(`lib/page.js`, line 428), and `createIndex()` calls `pagehandler.get()` for each slug (`lib/search.js`, line 272).

The page handler serves all reads and writes from one serial queue (`lib/page.js`, line 160 and lines 334–386).
So with N pages, about 2·N reads are queued at start-up, and a request for a page that arrives a moment later
is appended behind all of them. It is answered only when the sitemap and the index have read every page.

The site index is restored from `status/site-index.json` when it is present, so the index part mainly matters
when the index is (re)built; the sitemap is rebuilt at every start.

### Measurement

Same site, 28,000 small generated pages, fresh process each time, `status/` removed before each run so that
the sitemap and the index are built, farm mode, request for one page right after the server answers:

| | first page | sitemap and index complete |
|---|---|---|
| 0.28.2 | 20.3 s, 14.9 s | together with the first page |
| with the change below | 0.05 s, 0.04 s | about 15 s later, in the background |

In every run the sitemap had all 28,001 entries and `site-index.json` was written.

### Proposal

Give the start-up reads a queue of their own that is served only when no other request is waiting:

- `lib/page.js`: a second array `background`; the serial loop takes the next item from `queue` if it has one,
  else from `background`; a new `itself.getBackground(file, cb)` pushes onto `background`; `itself.pages()` uses
  `getBackground`.
- `lib/search.js`: `createIndex()` uses `pagehandler.getBackground` when present, else `pagehandler.get`.

Writes (`put`, `delete`, `saveToRecycler`) and ordinary `get`s stay in the one serial `queue`, in their order,
as before; only reads that nobody waits on move. A background read that runs after a write sees the written page.
The patch (against 0.28.2) is in RalfBarkow/wiki, branch `perf/interactive-reads-first`,
`nix/patches/wiki-server-interactive-reads-first.patch`.

### Open questions

- `isWorking()` and the `working`/`finished` events now also cover background reads, as before; is anything
  relying on them finishing early?
- Should other bulk readers (for example plugins that walk all pages) use `getBackground` as well?
