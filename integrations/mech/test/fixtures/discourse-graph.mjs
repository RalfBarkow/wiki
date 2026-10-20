// Trusted, authored offline Wiki data for the TRAVERSE acceptance tests (E2E-PLAN-r2/r3).
// One seed serves the node-level tests and the two isolated wikis of the browser test.
// Pages with the same slug have the same title on both sites. Item ids are fixed 16-hex values.
export const A = 'localhost:3021'
export const B = 'localhost:3022'
export const FROZEN = 1791453600000 // the clock of the existing acceptance fixtures

// id(prefix, n): 16 hex digits, stable and readable: page prefix + item number.
const id = (prefix, n) => prefix + n.toString(16).padStart(14, '0')
const fold = (p, n, text) => ({ type: 'pagefold', id: id(p, n), text })
const para = (p, n, text) => ({ type: 'paragraph', id: id(p, n), text })
const ref = (p, n, site, slug, title, text) => ({ type: 'reference', id: id(p, n), site, slug, title, text })

export const MECH_ITEM_TEXT = 'CLICK\n  NEIGHBORS\n  EXTRACT\n  TRAVERSE question claim support oppose\n  SOLO'
export const ids = {
  editedItem: id('a2', 7), // the Opposes paragraph of A/claim-a that the browser test edits
  mechItem: id('a1', 7),
}

// forks: sites named by `fork` journal entries. wiki-client 0.31.6 does not extend the neighborhood for
// reference items (lib/page.js getNeighbors), only for the page's own site and its fork/journal sites.
const page = (site, slug, title, story, age, forks = []) => ({ site, slug, title, story, age, forks })

// variant 'browser': the seed of the two wikis. 'extras': node-level additions only (AT-3b, AT-7b).
export function pages(variant = 'browser') {
  const claims = [
    fold('a1', 3, 'Claims'),
    para('a1', 4, '[[Claim A]]'),
    ref('a1', 5, B, 'claim-a', 'Claim A', 'The claim as stated on B.'),
  ]
  if (variant == 'extras')
    claims.push(
      ref('a1', 8, A, 'claim-a', 'Claim A', 'Explicit reference to the own site.'),
      para('a1', 9, '[[Missing]]'),
      ref('a1', 10, A, 'missing', 'Missing', 'Explicit reference to a page that does not exist.'),
      ref('a1', 11, B, 'missing', 'Missing', 'Explicit reference to a page that B does not have.'),
      para('a1', 12, '[[Claim A Renamed]]'),
    )
  const list = [
    page(A, 'question-q', 'Question Q', [
      fold('a1', 1, 'Question'),
      para('a1', 2, 'What should [[Topic T]] mean here?'),
      ...claims,
      fold('a1', 6, 'Graph'),
      { type: 'mech', id: ids.mechItem, text: MECH_ITEM_TEXT },
    ], 1, [B]),
    page(A, 'claim-a', 'Claim A', [
      fold('a2', 1, 'Claim'),
      para('a2', 2, 'Claim A as stated on A.'),
      fold('a2', 3, 'Supports'),
      para('a2', 4, '[[Evidence One]]'),
      para('a2', 5, '[[Evidence Three]]'),
      fold('a2', 6, 'Opposes'),
      para('a2', 7, '[[Evidence Two]]'),
    ], 2),
    page(A, 'evidence-one', 'Evidence One', [para('a3', 1, 'Evidence One on A.')], 3),
    page(A, 'evidence-two', 'Evidence Two', [para('a4', 1, 'Evidence Two on A.')], 4),
    page(A, 'topic-t', 'Topic T', [para('a5', 1, 'Topic T on A.')], 5),
    page(B, 'claim-a', 'Claim A', [
      fold('b2', 1, 'Claim'),
      para('b2', 2, 'Claim A as stated on B.'),
      fold('b2', 3, 'Supports'),
      para('b2', 4, '[[Evidence One]]'),
      fold('b2', 5, 'Opposes'),
      para('b2', 6, '[[Evidence Three]]'),
    ], 6),
    page(B, 'evidence-one', 'Evidence One', [para('b3', 1, 'Evidence One on B.')], 7),
    page(B, 'evidence-three', 'Evidence Three', [para('b4', 1, 'Evidence Three on B.')], 8),
  ]
  if (variant == 'extras')
    list.push(page(A, 'claim-a-renamed', 'Claim A', [para('a6', 1, 'A second page titled Claim A on A.')], 9))
  return list
}

export const asSlug = name => name.replace(/\s/g, '-').replace(/[^A-Za-z0-9-]/g, '').toLowerCase()
export const dateOf = p => FROZEN - p.age * 3600 * 1000

// Page JSON as the server stores and serves it.
export function pageJson(p) {
  return {
    title: p.title,
    story: p.story,
    journal: [
      { type: 'create', date: dateOf(p), item: { title: p.title, story: p.story } },
      ...p.forks.map(site => ({ type: 'fork', site, date: dateOf(p) + 1 })),
    ],
  }
}

// wiki-server lib/page.js extractPageLinks: [[x]] -> asSlug(x); a reference -> its slug (its site is dropped).
function sitemapLinks(story) {
  const links = new Map()
  for (const item of story) {
    const re = /\[\[([^\]]+)\]\]/g
    let m
    while ((m = re.exec(item.text || '')) != null) if (!links.has(asSlug(m[1]))) links.set(asSlug(m[1]), item.id)
    if (item.type == 'reference' && !links.has(item.slug)) links.set(item.slug, item.id)
  }
  return links.size ? Object.fromEntries(links) : undefined
}
// /system/sitemap.json entry
export const sitemapOf = (list, site) =>
  list.filter(p => p.site == site).map(p => ({
    slug: p.slug, title: p.title, date: dateOf(p), synopsis: p.story[0]?.text || '', links: sitemapLinks(p.story),
  }))
// wiki-client neighborhood entry: the sitemap entry plus its domain
export const neighborhoodOf = (list, site) => sitemapOf(list, site).map(info => ({ ...info, domain: site }))
export const clone = x => JSON.parse(JSON.stringify(x))

// Expected typed relations of the browser seed, written independently of every implementation.
export const expectedEdges = [
  [`${A}+question-q`, 'question', `${A}+topic-t`],
  [`${A}+question-q`, 'claim', `${A}+claim-a`],
  [`${A}+question-q`, 'claim', `${B}+claim-a`],
  [`${A}+claim-a`, 'support', `${A}+evidence-one`],
  [`${A}+claim-a`, 'support', `${A}+evidence-three`],
  [`${A}+claim-a`, 'oppose', `${A}+evidence-two`],
  [`${B}+claim-a`, 'support', `${B}+evidence-one`],
  [`${B}+claim-a`, 'oppose', `${B}+evidence-three`],
]
