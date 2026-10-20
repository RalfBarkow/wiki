// Node-level acceptance tests for TRAVERSE (E2E-PLAN-r2/r3). Runs the built discourse and upstream bundles
// with offline fixture data; no network, no browser. Usage:
//   node test/traverse.mjs --repository <mech git> --dependencies <node_modules> [--narrative-walks <file>]
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { argumentsOf, buildProfiles, moduleRoot, readJSON, sha } from '../scripts/build.mjs'
import { A, B, pages, pageJson, neighborhoodOf, clone, expectedEdges, ids } from './fixtures/discourse-graph.mjs'

const args = argumentsOf()
const output = path.join(moduleRoot, '.artifacts/traverse')
const built = await buildProfiles({ repository: args.repository, dependencies: args.dependencies, output })
const bundle = name => import(pathToFileURL(path.join(output, name, 'client/mech.js')))
const discourse = await bundle('discourse')
const upstream = await bundle('upstream')
const artifactSha = name => sha(fs.readFileSync(path.join(output, name, 'client/mech.js')))
const recorded = readJSON(path.join(moduleRoot, '../../docs/mech-profile-acceptance.json')).profileOutputs

const originalLog = console.log
console.log = () => {}
globalThis.fetch = () => {
  throw new Error('NETWORK DISABLED')
}
// Math.random is seeded per run so profile comparisons are repeatable.
let seed = 0
const reseed = n => {
  seed = n
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const results = []
const check = async (id, name, fn) => {
  await fn()
  results.push([id, name])
}
const triple = e => `${e.fromId} ${e.role} ${e.toId}`
const sortedTriples = edges => edges.map(triple).sort()
const orders = { 'A,B': [A, B], 'B,A': [B, A] }

// A Mech run on one page of the fixture, with the api the real client provides.
async function session(impl, list, siteOrder, lines, root = { site: A, slug: 'question-q' }) {
  const rootPage = list.find(p => p.site == root.site && p.slug == root.slug)
  const rawPage = clone(pageJson(rootPage))
  const pageObject = {
    getSlug: () => root.slug,
    getRawPage: () => rawPage,
    getTitle: () => rootPage.title,
    getRemoteSite: host => host,
  }
  const elements = {}, troubles = [], statuses = [], publications = []
  // The role WALK of discourse.mjs reads these browser globals (as in ambiguity.mjs).
  const elemPage = { id: root.slug, dataset: { key: 'root' } }
  globalThis.location = { host: root.site }
  globalThis.document = { querySelectorAll: () => [elemPage] }
  globalThis.wiki = { lineup: { atKey: () => pageObject } }
  const state = {}
  state.api = {
    element: key => (elements[key] ??= { id: key, innerHTML: '', previousElementSibling: { innerHTML: '', addEventListener() {} }, closest: () => elemPage }),
    neighborhood: () => siteOrder.map(site => clone(neighborhoodOf(list, site))),
    jfetch: async url => {
      const p = list.find(q => `//${q.site}/${q.slug}.json` == url)
      return p ? clone(pageJson(p)) : null
    },
    trouble: (elem, message) => troubles.push(message),
    status: (elem, command, text) => statuses.push(command + text),
    inspect() {},
    publishSourceData: (elem, topic, data) => publications.push({ topic, data }),
    host: () => undefined, // as upstream's api.host(), which has no return statement
    lineupPages: () => [pageObject],
    thisLineupKey: () => 'root',
    lineupAtKey: () => pageObject,
    ago: () => 'fixture-age',
  }
  const nest = impl.tree([...lines], [], 0)
  nest.flat(Infinity).forEach((part, index) => (part.key = 'b' + index))
  for (let i = 0; i < nest.length; i++) {
    const group = Array.isArray(nest[i + 1]) ? [nest[i], nest[++i]] : [nest[i]]
    await impl.run(group, state)
  }
  await new Promise(resolve => setTimeout(resolve, 50))
  return { state, troubles, statuses, publications }
}
const chain = ['NEIGHBORS', 'EXTRACT', 'TRAVERSE question claim support oppose']
const browserSeed = pages('browser')
const extrasSeed = pages('extras')
const run = {}
for (const [order, siteOrder] of Object.entries(orders)) run[order] = await session(discourse, browserSeed, siteOrder, chain)
const edgesOf = r => r.state.discourse.edges

// ---------------------------------------------------------------- AT-1 Read (existing EXTRACT, unchanged)
await check('AT-1', 'EXTRACT yields exactly the 8 typed relations, in both neighborhood orders', () => {
  const want = expectedEdges.map(e => e.join(' ')).sort()
  for (const r of Object.values(run)) {
    assert.deepEqual(r.troubles, [])
    assert.deepEqual(sortedTriples(edgesOf(r)), want)
    assert.equal(edgesOf(r).length, 8)
    assert.deepEqual(r.state.discourse.metadata.foldsUnknown, { graph: 1 })
  }
})

// ---------------------------------------------------------------- AT-2 .. AT-4 Resolve
const resolved = r => discourse.resolveEdges(edgesOf(r), r.state.neighborhood)
const pick = (list, from, role, to) => list.filter(e => e.fromId == from && e.role == role && e.toId == to)
await check('AT-2', 'unqualified links resolve on their own site although the other site has the same slug and title', () => {
  for (const r of Object.values(run)) {
    const list = resolved(r)
    const [claim] = pick(list, `${A}+question-q`, 'claim', `${A}+claim-a`)
    assert.deepEqual(claim.target, { status: 'resolved', declaredSite: A, slug: 'claim-a', title: 'Claim A' })
    const [evidence] = pick(list, `${B}+claim-a`, 'support', `${B}+evidence-one`)
    assert.deepEqual(evidence.target, { status: 'resolved', declaredSite: B, slug: 'evidence-one', title: 'Evidence One' })
  }
})
await check('AT-3', 'an explicitly declared site is kept; a missing target at that site stays unresolved', () => {
  for (const r of Object.values(run)) {
    const [other] = pick(resolved(r), `${A}+question-q`, 'claim', `${B}+claim-a`)
    assert.deepEqual(other.target, { status: 'resolved', declaredSite: B, slug: 'claim-a', title: 'Claim A' })
    const probe = [
      { fromId: `${A}+question-q`, toId: `${B}+missing`, role: 'claim', source: {} },
      { fromId: `${A}+question-q`, toId: 'localhost:3099+claim-a', role: 'claim', source: {} },
    ]
    const [missing, outside] = discourse.resolveEdges(probe, r.state.neighborhood)
    assert.deepEqual(missing.target, { status: 'unresolved', declaredSite: B, slug: 'missing', reason: 'not-found-at-declared-site', candidates: [] })
    assert.deepEqual(outside.target, { status: 'unresolved', declaredSite: 'localhost:3099', slug: 'claim-a', reason: 'not-found-at-declared-site', candidates: [A, B] })
  }
})
const extras = {}
for (const [order, siteOrder] of Object.entries(orders)) extras[order] = await session(discourse, extrasSeed, siteOrder, chain)
await check('AT-3b', 'a reference to the own site is indistinguishable from an unqualified link after EXTRACT, and resolves alike', () => {
  for (const r of Object.values(extras)) {
    const self = pick(edgesOf(r), `${A}+question-q`, 'claim', `${A}+claim-a`)
    assert.equal(self.length, 2, 'the link [[Claim A]] and the own-site reference')
    assert.deepEqual(self[0], self[1], 'identical edges including source: the declaration kind is lost')
    const list = resolved(r)
    const ends = pick(list, `${A}+question-q`, 'claim', `${A}+claim-a`).map(e => e.target)
    assert.deepEqual(ends, Array(2).fill({ status: 'resolved', declaredSite: A, slug: 'claim-a', title: 'Claim A' }))
    const missing = pick(list, `${A}+question-q`, 'claim', `${A}+missing`)
    assert.equal(missing.length, 2, '[[Missing]] and the own-site reference to a missing page')
    assert.deepEqual(missing[0], missing[1])
    assert.deepEqual(missing[0].target, { status: 'unresolved', declaredSite: A, slug: 'missing', reason: 'not-found-at-declared-site', candidates: [] })
  }
})
await check('AT-4', 'a target not on the declaring site stays unresolved; the other site is a candidate, never chosen', () => {
  for (const r of Object.values(run)) {
    const [edge] = pick(resolved(r), `${A}+claim-a`, 'support', `${A}+evidence-three`)
    assert.deepEqual(edge.target, { status: 'unresolved', declaredSite: A, slug: 'evidence-three', reason: 'not-found-at-declared-site', candidates: [B] })
    const traversed = r.state.traversal.edges
    assert.equal(traversed.filter(e => e.toId == `${B}+evidence-three` && e.fromId == `${A}+claim-a`).length, 0)
  }
})

// ---------------------------------------------------------------- AT-5 Traverse
const ROLES = ['question', 'claim', 'support', 'oppose']
await check('AT-5', 'typed traversal: exact edge sets, role filter, no jump over untyped edges, roots, depth, order independence', () => {
  const outputs = Object.values(run).map(r => JSON.stringify(r.state.traversal.edges))
  assert.equal(outputs[0], outputs[1], 'identical for both neighborhood orders')
  for (const r of Object.values(run)) {
    const list = resolved(r)
    const all = discourse.traverse(list, [`${A}+question-q`], ROLES)
    assert.deepEqual(sortedTriples(all), expectedEdges.map(e => e.join(' ')).sort())
    assert.deepEqual(all.filter(e => e.target.status == 'unresolved').map(triple), [`${A}+claim-a support ${A}+evidence-three`])
    assert.deepEqual(sortedTriples(discourse.traverse(list, [`${A}+question-q`], ['claim'])), [`${A}+question-q claim ${A}+claim-a`, `${A}+question-q claim ${B}+claim-a`])
    assert.deepEqual(discourse.traverse(list, [`${A}+question-q`], ['support']), [])
    assert.deepEqual(sortedTriples(discourse.traverse(list, [`${B}+claim-a`], ROLES)), [`${B}+claim-a oppose ${B}+evidence-three`, `${B}+claim-a support ${B}+evidence-one`])
    assert.deepEqual(sortedTriples(discourse.traverse(list, [`${A}+question-q`], ROLES, 1)), [`${A}+question-q claim ${A}+claim-a`, `${A}+question-q claim ${B}+claim-a`, `${A}+question-q question ${A}+topic-t`])
    assert.deepEqual(r.state.traversal.edges.map(triple), all.map(triple), 'the block traverses the same edges')
  }
})

// ---------------------------------------------------------------- AT-6 Oracle: narrative-walks.js (test only)
const oraclePath = args['narrative-walks'] || path.join(process.env.HOME, 'workspace/narrative-walks.js')
const oracleSha = sha(fs.readFileSync(oraclePath))
await check('AT-6', 'narrative-walks.js, as an independent oracle, reaches the same edges', async () => {
  const nw = await import(pathToFileURL(oraclePath))
  const asGraph = edges => {
    const names = [...new Set(edges.flatMap(e => [e.fromId, e.toId]))].sort()
    return { names, graph: { nodes: names.map(type => ({ type })), rels: edges.map(e => ({ type: e.role, from: names.indexOf(e.fromId), to: names.indexOf(e.toId) })) } }
  }
  const reachedBy = (edges, start, edgeType = '*') => {
    const { names, graph } = asGraph(edges)
    const index = nw.indexGraph(graph, { nodeLabel: n => n.type })
    const pairs = new Set()
    for (const walk of nw.computeAllWalks(index, { start: String(names.indexOf(start)), edgeType }))
      for (let i = 1; i < walk.length; i++) pairs.add(`${names[walk[i - 1]]} > ${names[walk[i]]}`)
    return pairs
  }
  const pairsOf = edges => new Set(edges.map(e => `${e.fromId} > ${e.toId}`))
  for (const r of Object.values(run)) {
    const list = resolved(r)
    const mine = discourse.traverse(list, [`${A}+question-q`], ROLES)
    assert.deepEqual([...reachedBy(list, `${A}+question-q`)].sort(), [...pairsOf(mine)].sort())
    const claimOnly = discourse.traverse(list, [`${A}+question-q`], ['claim'])
    assert.deepEqual([...reachedBy(list, `${A}+question-q`, 'claim')].sort(), [...pairsOf(claimOnly)].sort())
    const without = list.filter(e => e.role != 'oppose')
    assert.deepEqual([...reachedBy(without, `${A}+question-q`)].sort(), [...pairsOf(discourse.traverse(list, [`${A}+question-q`], ['question', 'claim', 'support']))].sort())
  }
})

// ---------------------------------------------------------------- AT-7 / AT-7b Present
const solo = node => `${node.type}: ${node.props.name}`
const nodeView = node => ({ type: node.type, name: node.props.name, site: node.props.site, slug: node.props.slug, title: node.props.title, id: node.props.id, candidates: node.props.candidates })
const wikiPage = (site, slug, title) => ({ type: 'WikiPage', name: `${site}/${slug}`, site, slug, title, id: `${site}+${slug}`, candidates: undefined })
await check('AT-7', 'the presented graph has exactly the expected nodes and typed relations', () => {
  for (const r of Object.values(run)) {
    const graph = discourse.presentGraph(r.state.traversal.edges)
    const want = [
      wikiPage(A, 'question-q', 'Question Q'), wikiPage(A, 'topic-t', 'Topic T'), wikiPage(A, 'claim-a', 'Claim A'), wikiPage(B, 'claim-a', 'Claim A'),
      wikiPage(A, 'evidence-one', 'Evidence One'), wikiPage(A, 'evidence-two', 'Evidence Two'), wikiPage(B, 'evidence-one', 'Evidence One'), wikiPage(B, 'evidence-three', 'Evidence Three'),
      { type: 'UnresolvedLink', name: `${A}/evidence-three`, site: undefined, slug: 'evidence-three', title: undefined, id: undefined, candidates: [B] },
    ]
    const key = n => n.type + n.name
    assert.deepEqual(graph.nodes.map(nodeView).sort((a, b) => (key(a) < key(b) ? -1 : 1)), want.sort((a, b) => (key(a) < key(b) ? -1 : 1)))
    const idOf = i => graph.nodes[i].props.id ?? `${graph.nodes[i].props.declaredSite}+${graph.nodes[i].props.slug}`
    assert.deepEqual(graph.rels.map(rel => `${idOf(rel.from)} ${rel.type} ${idOf(rel.to)}`).sort(), expectedEdges.map(e => e.join(' ')).sort())
    for (const node of graph.nodes) if (node.type == 'WikiPage') assert.ok(!node.props.title.includes(node.props.site), 'title carries no site')
    const unresolved = graph.nodes.find(n => n.type == 'UnresolvedLink')
    assert.equal('site' in unresolved.props, false, 'no site, so Solo does not navigate')
    for (const rel of graph.rels) assert.deepEqual(Object.keys(rel.props).sort(), ['declaredOn', 'extractorVersion', 'fold'])
    assert.deepEqual(r.publications.map(p => p.topic), ['aspect'])
    assert.deepEqual(r.state.aspect.map(a => [a.source, a.result.map(x => x.name)]), [['TRAVERSE question claim support oppose', ['TRAVERSE question claim support oppose']]])
  }
})
await check('AT-7b', "Solo's merge key (type: name) is unique with site/slug names and collides with title+site names", () => {
  for (const r of Object.values(extras)) {
    const graph = discourse.presentGraph(r.state.traversal.edges)
    const keys = graph.nodes.map(solo)
    assert.equal(new Set(keys).size, keys.length, 'pairwise distinct')
    assert.ok(keys.includes(`WikiPage: ${A}/claim-a`) && keys.includes(`WikiPage: ${A}/claim-a-renamed`))
    assert.equal(graph.nodes.filter(n => n.type == 'WikiPage').length, 9, 'eight pages of the browser seed and claim-a-renamed')
    assert.deepEqual(graph.nodes.filter(n => n.type == 'UnresolvedLink').map(n => n.props.name).sort(), [`${A}/evidence-three`, `${A}/missing`, `${B}/missing`])
    const titleSite = graph.nodes.filter(n => n.type == 'WikiPage').map(n => `${n.type}: ${n.props.title}\n${n.props.site}`)
    assert.ok(titleSite.length > new Set(titleSite).size, 'title+site names collide')
    assert.equal(titleSite.filter(k => k == `WikiPage: Claim A\n${A}`).length, 2)
  }
})

// ---------------------------------------------------------------- AT-10 Ward's WALK unchanged
const walkPlans = [
  ['NEIGHBORS', 'WALK 5 hubs'],
  ['NEIGHBORS', 'WALK lineup'],
  ['NEIGHBORS', 'WALK references'],
  ['NEIGHBORS', 'WALK 3 topics'],
  ['NEIGHBORS', `FROM ${A}/question-q`, '  WALK 1 clicks'],
]
const graphsOf = r => (r.state.aspect || []).flatMap(a => a.result.map(x => ({ source: a.source, name: x.name, nodes: x.graph.nodes, rels: x.graph.rels })))
await check('AT-10', 'upstream artifact byte-identical to the recorded one; TRAVERSE absent there; Ward WALK modes identical in both profiles', async () => {
  assert.equal(artifactSha('upstream'), recorded['mech-upstream'].mech.artifacts['client/mech.js'].sha256)
  assert.equal(Object.keys(upstream.blocks).includes('TRAVERSE'), false)
  const absent = await session(upstream, browserSeed, [A, B], ['NEIGHBORS', 'TRAVERSE claim'])
  assert.deepEqual(absent.troubles, ["TRAVERSE doesn't name a block we know."])
  for (const lines of walkPlans)
    for (const siteOrder of Object.values(orders)) {
      reseed(1)
      const up = await session(upstream, browserSeed, siteOrder, lines)
      reseed(1)
      const dc = await session(discourse, browserSeed, siteOrder, lines)
      assert.deepEqual(dc.troubles, up.troubles)
      assert.ok(graphsOf(up).length > 0, lines.join(' | ') + ' produced aspects')
      assert.deepEqual(graphsOf(dc), graphsOf(up), lines.join(' | '))
    }
})

// ---------------------------------------------------------------- AT-11 (node level) role WALK unchanged
await check('AT-11', 'src/discourse.mjs and the other pinned files are byte-identical; role WALK still projects untyped neighborhoods', async () => {
  const pin = {
    'src/discourse.mjs': '2ed678f4458d69251688837b62f68a7151e04d06640901feb455ea700073cda8',
    'src/upstream-entry.mjs': '96147b62cc42f6a7d9e22826601dea95f7388bfb54ac4c40ffa42f58ca51a96f',
    'scripts/build.mjs': '0da3d8aa619dd7e31f9778e0c79875fb75dfd283ab18deeaa204bbac1c562e28',
    'sources.json': '97fa17d43461a2aa607e4431c4da91cef46e65d5c036d8ca19f5368c8d47099c',
    'package.json': '38afe9e6c201e33a49b1379b3d70e5d1962d403ee46402410b0bc667708fd0dd',
  }
  for (const [file, expected] of Object.entries(pin)) assert.equal(sha(fs.readFileSync(path.join(moduleRoot, file))), expected, file)
  const roleWalk = await session(discourse, browserSeed, [A, B], ['NEIGHBORS', 'EXTRACT', 'WALK 5 questions'])
  assert.deepEqual(roleWalk.troubles, [])
  const graphs = graphsOf(roleWalk)
  assert.ok(graphs.length > 0)
  assert.deepEqual([...new Set(graphs.flatMap(g => g.rels.map(rel => rel.type)))], [''], 'role WALK relations are untyped')
  assert.equal(roleWalk.state.traversal, undefined)
})

// ---------------------------------------------------------------- AT-12 separate identity
await check('AT-12', 'the discourse artifact has its own identity; the addition is confined to the discourse profile', () => {
  assert.notEqual(artifactSha('discourse'), recorded['mech-discourse'].mech.artifacts['client/mech.js'].sha256)
  const profile = name => built.find(b => b.profile == name)
  assert.equal(profile('upstream').extension, null)
  assert.notEqual(profile('discourse').extension.sourceContentSha256, '4b4dea00306480b43d200f435e79541b5d3dc8dcc0549ee7785166cfeffb3b51')
  const inputs = name => Object.keys(readJSON(path.join(output, name, 'metafile.json')).inputs)
  assert.equal(inputs('discourse').some(x => x.endsWith('src/discourse-traverse.mjs')), true)
  assert.equal(inputs('upstream').some(x => x.endsWith('src/discourse-traverse.mjs')), false)
  assert.equal(inputs('upstream').some(x => x.endsWith('src/discourse.mjs')), false)
  assert.equal(sha(fs.readFileSync(path.join(output, 'upstream/client/mech.css'))), recorded['mech-upstream'].mech.artifacts['client/mech.css'].sha256)
})

// ---------------------------------------------------------------- AT-13 scope boundaries
await check('AT-13', 'EXTRACT edges carry no story-item id; the role is the fold label', async () => {
  for (const r of Object.values(run))
    for (const edge of edgesOf(r)) {
      assert.deepEqual(Object.keys(edge).sort(), ['fromId', 'role', 'source', 'toId'])
      assert.deepEqual(Object.keys(edge.source).sort(), ['extractorVersion', 'fold', 'pageId'])
      assert.equal(JSON.stringify(edge).includes(ids.editedItem), false)
    }
  const renamed = clone(browserSeed)
  const claim = renamed.find(p => p.site == A && p.slug == 'claim-a')
  claim.story.find(item => item.type == 'pagefold' && item.text == 'Opposes').text = 'Supports'
  const r = await session(discourse, renamed, [A, B], chain)
  assert.deepEqual(pick(edgesOf(r), `${A}+claim-a`, 'support', `${A}+evidence-two`).length, 1, 'renaming the fold label changes the role of the link after it')
  assert.equal(pick(edgesOf(r), `${A}+claim-a`, 'oppose', `${A}+evidence-two`).length, 0)
})

console.log = originalLog
console.log(`TRAVERSE node-level acceptance: ${results.length} PASS`)
for (const [id, name] of results) console.log(`PASS ${id} ${name}`)
console.log(`oracle narrative-walks.js sha256 ${oracleSha}`)
console.log(`artifacts: upstream ${artifactSha('upstream')} discourse ${artifactSha('discourse')}`)
