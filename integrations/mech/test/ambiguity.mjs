import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { argumentsOf, buildProfiles, moduleRoot } from '../scripts/build.mjs'
const args = argumentsOf(),
  output = path.join(moduleRoot, '.artifacts/ambiguity')
await buildProfiles({ repository: args.repository, dependencies: args.dependencies, output, withBaseline: true })
const baseline = await import(pathToFileURL(path.join(output, 'baseline/client/mech.js')))
const composite = await import(pathToFileURL(path.join(output, 'discourse/client/mech.js')))
import { fixture, alpha, beta, rootSlug, twinSlug, clone } from './fixtures/twins.mjs'
const originalDate = Date,
  originalLog = console.log
const root = pathToFileURL(output + '/')
const files = ['baseline/client/mech.js', 'discourse/client/mech.js']
const hashes = () =>
  Object.fromEntries(
    files.map(n => [
      n,
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(new URL(n, root)))
        .digest('hex'),
    ]),
  )
const before = hashes()
let networkAttempts = 0
globalThis.fetch = () => {
  networkAttempts++
  throw new Error('NETWORK DISABLED')
}
globalThis.Date = class extends originalDate {
  constructor(...a) {
    super(...(a.length ? a : [1791453600000]))
  }
  static now() {
    return 1791453600000
  }
}
console.log = () => {}
const provenance = fixture.pages.map(page => ({
  id: page.site + '+' + page.slug,
  site: page.site,
  slug: page.slug,
  date: page.date,
  title: page.title,
  storyItemIds: page.story.map(x => x.id),
  source: 'trusted twins-fixture.mjs',
  sha256: crypto.createHash('sha256').update(JSON.stringify(page)).digest('hex'),
}))
function observeFind(array, lookups) {
  return new Proxy(array, {
    get(target, key, receiver) {
      if (key !== 'find') return Reflect.get(target, key, receiver)
      return function (predicate, thisArg) {
        const stack = new Error().stack.split('\n').slice(1)
        const record = {
          caller: stack.some(x => x.includes('blanket'))
            ? 'blanket graph construction'
            : stack.some(x => x.includes('roleWalk'))
              ? 'roleWalk root selection'
              : 'other',
          stack,
          candidates: [],
        }
        const selected = Array.prototype.find.call(receiver, (info, index, arr) => {
          const accesses = []
          const probe = new Proxy(info, {
            get(object, prop, recv) {
              if (typeof prop === 'string') accesses.push(prop)
              return Reflect.get(object, prop, recv)
            },
          })
          const matches = predicate.call(thisArg, probe, index, arr)
          record.candidates.push({
            id: info.domain + '+' + info.slug,
            date: info.date,
            propertiesRead: accesses,
            matches,
          })
          return matches
        })
        record.result = selected
          ? {
              id: selected.domain + '+' + selected.slug,
              site: selected.domain,
              slug: selected.slug,
              date: selected.date,
              title: selected.title,
            }
          : null
        record.siteConstraintEvaluated = record.candidates.some(c => c.propertiesRead.includes('domain'))
        lookups.push(record)
        return selected
      }
    },
  })
}
async function run(implementation, siteOrder, traced) {
  const elemPage = { id: rootSlug, dataset: { key: 'root-page' } }
  const rawPage = clone(fixture.pages[0])
  globalThis.location = { host: alpha }
  globalThis.document = {
    querySelectorAll: s => {
      assert.equal(s, '.page')
      return [elemPage]
    },
  }
  globalThis.wiki = {
    lineup: {
      atKey: k => {
        assert.equal(k, 'root-page')
        return { getSlug: () => rootSlug, getRawPage: () => rawPage }
      },
    },
  }
  const batches = [],
    listeners = []
  globalThis.window = {
    origin: 'https://' + alpha,
    addEventListener: (event, fn) => listeners.push({ event, function: fn.name }),
    open: (url, name, features) => {
      assert.equal(url, '/plugins/solo/dialog/#')
      return {
        location: { pathname: '/plugins/solo/dialog/' },
        postMessage: (data, origin) => batches.push({ data: clone(data), origin }),
      }
    },
  }
  const elements = {},
    fetches = [],
    errors = [],
    publications = [],
    statuses = [],
    lookups = []
  const state = { context: { pageKey: 'root-page', title: rawPage.title, page: rawPage, itemId: 'trusted-mech-item' } }
  state.api = {
    element(key) {
      return (elements[key] ??= {
        id: key,
        innerHTML: '',
        previousElementSibling: { innerHTML: '', addEventListener() {} },
        closest: () => elemPage,
      })
    },
    neighborhood(want) {
      assert.equal(want, undefined)
      return siteOrder.map(site => clone(fixture.sitemaps[site]))
    },
    jfetch: async url => {
      fetches.push(url)
      const page = fixture.pages.find(p => '//' + p.site + '/' + p.slug + '.json' === url)
      assert(page, 'Unexpected fixture URL ' + url)
      return clone(page)
    },
    trouble(elem, message) {
      errors.push({ id: elem.id, message })
    },
    status(elem, command, text) {
      statuses.push({ id: elem.id, command, text })
      elem.innerHTML = command + text
    },
    inspect() {},
    publishSourceData(elem, topic, data) {
      publications.push({ id: elem.id, topic, data: clone(data) })
    },
  }
  const nest = implementation.tree(['NEIGHBORS', 'EXTRACT', 'WALK 60 questions', 'SOLO'], [], 0)
  nest.forEach((part, index) => (part.key = 'op' + index))
  await implementation.run([nest[0]], state)
  const neighborhood = clone(state.neighborhood)
  if (traced) state.neighborhood = observeFind(state.neighborhood, lookups)
  await implementation.run([nest[1]], state)
  const extracted = clone(state.discourse)
  await implementation.run([nest[2]], state)
  const aspects = clone(state.aspect)
  await implementation.run([nest[3]], state)
  const qualifiedRootLookup = lookups.find(l => l.caller === 'roleWalk root selection')
  const graphLookup = lookups.find(l => l.caller === 'blanket graph construction')
  return {
    neighborhood,
    extracted,
    aspects,
    publications,
    batches,
    errors,
    fetches,
    listeners,
    statuses,
    rootSelection: {
      mode: 'question',
      lineupIds: [alpha + '+' + rootSlug],
      eligibleSourceIds: [
        ...new Set(
          extracted.edges.filter(e => e.role === 'question' && e.fromId === alpha + '+' + rootSlug).map(e => e.fromId),
        ),
      ],
      firstGraphNode: aspects[0].result[0].graph.nodes[0],
      qualifiedLookup: qualifiedRootLookup?.result ?? null,
    },
    lookups,
    tracedGraphTarget: graphLookup?.result ?? null,
  }
}
const results = []
try {
  for (const order of [
    [alpha, beta],
    [beta, alpha],
  ])
    for (const [label, implementation] of [
      ['baseline', baseline],
      ['composite', composite],
    ]) {
      const traced = await run(implementation, order, true)
      const control = await run(implementation, order, false)
      for (const name of [
        'neighborhood',
        'extracted',
        'aspects',
        'publications',
        'batches',
        'errors',
        'fetches',
        'listeners',
        'statuses',
      ])
        assert.deepEqual(traced[name], control[name], 'Trace changed ' + name)
      assert.equal(traced.errors.length, 0)
      assert.equal(traced.extracted.edges.length, 1)
      assert.equal(traced.extracted.edges[0].fromId, alpha + '+' + rootSlug)
      assert.equal(traced.extracted.edges[0].toId, alpha + '+' + twinSlug)
      assert.equal(traced.rootSelection.qualifiedLookup.id, alpha + '+' + rootSlug)
      assert.equal(traced.lookups.length, 2)
      assert.equal(traced.lookups[0].siteConstraintEvaluated, true)
      assert.equal(traced.lookups[1].siteConstraintEvaluated, false)
      const expected = label === 'baseline' || order[0] === beta ? beta : alpha
      assert.equal(traced.tracedGraphTarget.site, expected)
      assert.equal(traced.aspects[0].result[0].graph.nodes.length, 2)
      assert.equal(traced.aspects[0].result[0].graph.rels.length, 2)
      assert.deepEqual(traced.batches[0].data.sources[0].aspects, traced.aspects[0].result)
      results.push({ implementation: label, siteOrder: order, tracingMatchesUninstrumented: true, ...traced })
    }
  assert.deepEqual(before, hashes())
  assert.equal(networkAttempts, 0)
  const semantics = {
    extractedEqualAcrossCases: results.every(r => JSON.stringify(r.extracted) === JSON.stringify(results[0].extracted)),
    baselineSiteOrderInvariant: JSON.stringify(results[0].aspects) === JSON.stringify(results[2].aspects),
    compositeSiteOrderInvariant: JSON.stringify(results[1].aspects) === JSON.stringify(results[3].aspects),
    alphaFirstAspectsEqual: JSON.stringify(results[0].aspects) === JSON.stringify(results[1].aspects),
    betaFirstAspectsEqual: JSON.stringify(results[2].aspects) === JSON.stringify(results[3].aspects),
    alphaFirstBatchesEqual: JSON.stringify(results[0].batches) === JSON.stringify(results[1].batches),
    betaFirstBatchesEqual: JSON.stringify(results[2].batches) === JSON.stringify(results[3].batches),
  }
  const report = {
    experiment: 'Offline NEIGHBORS twin-slug graph resolution',
    startedSources: before,
    sourceProvenance: provenance,
    testedRevisions: {
      baseline: 'abd88d2da6c89029515f2a456356832dffe038ab',
      upstream: 'a028b4bba04e539dcaa090423d38a00a0050489d',
    },
    node: process.version,
    networkAttempts,
    browserExecuted: false,
    cases: 4,
    untracedControls: 4,
    semantics,
    results,
  }
  fs.writeFileSync(path.join(output, 'twins-results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log = originalLog
  console.log(
    JSON.stringify(
      {
        cases: 4,
        controls: 4,
        networkAttempts,
        semantics,
        summary: results.map(r => ({
          implementation: r.implementation,
          siteOrder: r.siteOrder,
          neighborhood: r.neighborhood.map(x => x.domain + '+' + x.slug),
          root: r.rootSelection.qualifiedLookup.id,
          typedEdgeTarget: r.extracted.edges[0].toId,
          graphTarget: r.tracedGraphTarget.id,
          graphNodes: r.aspects[0].result[0].graph.nodes,
          graphEdges: r.aspects[0].result[0].graph.rels,
        })),
      },
      null,
      2,
    ),
  )
} finally {
  console.log = originalLog
  globalThis.Date = originalDate
}
