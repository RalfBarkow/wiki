import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { argumentsOf, buildProfiles, moduleRoot } from '../scripts/build.mjs'
const args = argumentsOf(),
  output = path.join(moduleRoot, '.artifacts/semantic')
await buildProfiles({ repository: args.repository, dependencies: args.dependencies, output, withBaseline: true })
const baseline = await import(pathToFileURL(path.join(output, 'baseline/client/mech.js')))
const composite = await import(pathToFileURL(path.join(output, 'discourse/client/mech.js')))
const upstream = await import(pathToFileURL(path.join(output, 'upstream/client/mech.js')))
import { site, pages, neighborhoods, failureNeighborhood, clone } from './fixtures/semantic.mjs'
const NativeDate = Date
const now = 1791453600000
globalThis.Date = class extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : [now]))
  }
  static now() {
    return now
  }
}
globalThis.fetch = () => {
  throw new Error('Network disabled in trusted fixture harness')
}
const log = console.log
const capturedLogs = []
console.log = (...args) => capturedLogs.push(args)
const results = []
function installEnvironment(rootSlug = 'root-old') {
  const page = { id: rootSlug, dataset: { key: 'current' } }
  const before = { id: 'root-new', dataset: { key: 'before' } }
  const objects = {
    current: { getSlug: () => rootSlug, getRawPage: () => ({ story: [] }) },
    before: { getSlug: () => before.id, getRawPage: () => ({ story: [] }) },
  }
  globalThis.wiki = { lineup: { atKey: key => objects[key] } }
  globalThis.location = { host: site }
  globalThis.document = {
    querySelectorAll: selector => {
      assert.equal(selector, '.page')
      return [before, page]
    },
  }
  globalThis.$ = () => ({ on() {} })
  return { page, objects }
}
async function execute(impl, text, initial = {}, options = {}) {
  const { page, objects } = installEnvironment(options.rootSlug)
  const elements = {}
  const trace = {
    fetches: [],
    errors: [],
    statuses: [],
    publications: [],
    inspections: [],
    batches: [],
    listeners: [],
    buttons: [],
  }
  globalThis.window = {
    origin: 'https://' + site,
    addEventListener: (name, fn) => trace.listeners.push(name),
    open: (url, name, features) => ({
      location: { pathname: '/plugins/solo/dialog/' },
      postMessage: (data, origin) => trace.batches.push({ data: clone(data), origin }),
    }),
  }
  const state = {
    context: {
      title: 'Trusted Fixture',
      pageKey: 'current',
      itemId: 'fixture-item',
      page: { title: 'Trusted Fixture', story: [] },
    },
    ...clone(initial),
  }
  const callbacks = []
  state.api = {
    element(key) {
      return (elements[key] ??= {
        id: key,
        innerHTML: '',
        previousElementSibling: { innerHTML: '', addEventListener() {} },
        closest: () => page,
      })
    },
    trouble(elem, message) {
      trace.errors.push({ key: elem.id, message })
    },
    status(elem, command, text) {
      trace.statuses.push({ key: elem.id, command, text })
      elem.innerHTML = command + text
    },
    jfetch: async url => {
      trace.fetches.push(url)
      const p = pages[url]
      if (p?.fixtureError) throw new Error(p.fixtureError)
      return p ? clone(p) : null
    },
    inspect(elem, key, target) {
      if (target.debug) trace.inspections.push({ key: elem.id, property: key, value: clone(target[key] ?? null) })
    },
    publishSourceData(elem, topic, data) {
      trace.publications.push({ key: elem.id, topic, data: clone(data) })
    },
    neighborhood(want) {
      return clone(neighborhoods).filter(s => !want || s[0].domain.includes(want))
    },
    button(elem, label, handler) {
      trace.buttons.push({ key: elem.id, label })
      callbacks.push(handler)
    },
    reset() {},
    response(elem, text) {
      elem.innerHTML += text
    },
    lineupAtKey: key => objects[key],
    thisLineupKey: () => 'current',
    lineupPages: () => [page],
    host: () => site,
  }
  const nest = impl.tree(text.split('\n'), [], 0)
  let number = 0
  const assign = parts => parts.forEach(part => (Array.isArray(part) ? assign(part) : (part.key = 'k' + number++)))
  assign(nest)
  let seed = 123456
  const originalRandom = Math.random
  Math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
  try {
    await impl.run(nest, state, options.initiator)
    if (options.click && callbacks.length) {
      callbacks.shift()({ shiftKey: false })
      await new Promise(r => setTimeout(r, options.solo ? 900 : 20))
    }
  } finally {
    Math.random = originalRandom
  }
  const { api, ...data } = state
  return {
    state: clone(data),
    trace,
    html: Object.fromEntries(Object.entries(elements).map(([k, e]) => [k, e.innerHTML])),
  }
}
const roleEdges = [
  {
    fromId: site + '+root-old',
    toId: site + '+target-page',
    role: 'question',
    source: { pageId: site + '+root-old', fold: 'question' },
  },
  {
    fromId: site + '+root-new',
    toId: site + '+root-old',
    role: 'claim',
    source: { pageId: site + '+root-new', fold: 'claim' },
  },
  {
    fromId: 'beta.fixture.test+root-new',
    toId: site + '+root-old',
    role: 'support',
    source: { pageId: 'beta.fixture.test+root-new', fold: 'support' },
  },
  {
    fromId: site + '+target-page',
    toId: site + '+root-old',
    role: 'oppose',
    source: { pageId: site + '+target-page', fold: 'oppose' },
  },
]
async function test(name, fn) {
  try {
    await fn()
    results.push({ name, status: 'PASS' })
  } catch (e) {
    results.push({ name, status: 'FAIL', message: e.message, stack: e.stack, actual: e.actual, expected: e.expected })
  }
}
async function equivalent(name, text, state = {}, options = {}) {
  await test(name, async () => {
    const a = await execute(baseline, text, state, options),
      b = await execute(composite, text, state, options)
    assert.deepEqual(b, a)
    return true
  })
}
for (const [label, text, state] of [
  ['EXTRACT missing input', 'EXTRACT', {}],
  ['EXTRACT complete', 'EXTRACT', { neighborhood: neighborhoods.flat() }],
  ['EXTRACT limits and failures', 'EXTRACT 4', { neighborhood: failureNeighborhood }],
  ['EXTRACT all failures accounted', 'EXTRACT', { neighborhood: failureNeighborhood }],
  ['EXTRACT ignores invalid numeric args', 'EXTRACT 0 nonsense', { neighborhood: neighborhoods.flat() }],
  [
    'EXTRACT preserves neighborhood priority over items',
    'EXTRACT',
    { neighborhood: neighborhoods.flat(), items: [{ site, slug: 'target-page' }] },
  ],
  ['EDGES requires extraction', 'EDGES', {}],
  ['EDGES empty diagnostics', 'EDGES', { discourse: { edges: [] } }],
  ['EDGES complete grouping', 'EDGES', { discourse: { edges: roleEdges } }],
  ['EDGES type filter and limit', 'EDGES type:question 1', { discourse: { edges: roleEdges } }],
  ['EDGES no matching type', 'EDGES unsupported', { discourse: { edges: roleEdges } }],
  [
    'EDGES escaped title labels',
    'EDGES',
    { discourse: { edges: roleEdges, pagesById: { [site + '+root-old']: { title: 'Root <&>' } } } },
  ],
  ['DEBUG default', 'DEBUG', {}],
  ['DEBUG on', 'DEBUG on', {}],
  ['DEBUG off', 'DEBUG off', { debug: true }],
  ['DEBUG invalid', 'DEBUG other', {}],
])
  await equivalent(label, text, state)
for (const role of ['question', 'claim', 'support', 'oppose']) {
  await equivalent('WALK ' + role + ' role data', 'WALK 60 ' + role, {
    neighborhood: neighborhoods.flat(),
    discourse: { edges: roleEdges },
  })
  await equivalent(
    'WALK ' + role + ' fallback',
    'WALK 1 ' + role,
    { neighborhood: neighborhoods.flat(), discourse: { edges: roleEdges } },
    { rootSlug: 'out-of-scope' },
  )
}
await equivalent('WALK plural questions', 'WALK 60 questions', {
  neighborhood: neighborhoods.flat(),
  discourse: { edges: roleEdges },
})
await equivalent('WALK plural claims', 'WALK 30 claims', {
  neighborhood: neighborhoods.flat(),
  discourse: { edges: roleEdges },
})
await equivalent('WALK missing neighborhood', 'WALK questions', {})
await equivalent('WALK missing EXTRACT', 'WALK questions', { neighborhood: neighborhoods.flat() })
await equivalent('WALK publishes stable per-command aspects', 'WALK 60 questions\nWALK 30 claims', {
  neighborhood: neighborhoods.flat(),
  discourse: { edges: roleEdges },
})
for (const text of ['WALK', 'WALK 2 hubs', 'WALK 1 weeks', 'WALK invalid'])
  await test('Ordinary upstream delegate: ' + text, async () => {
    assert.deepEqual(
      await execute(composite, text, { neighborhood: neighborhoods.flat() }),
      await execute(upstream, text, { neighborhood: neighborhoods.flat() }),
    )
  })
await equivalent(
  'Data workflow from identical pre-existing neighborhood',
  'EXTRACT\nEDGES\nWALK 60 questions\nWALK 30 claims\nSOLO',
  { neighborhood: neighborhoods.flat() },
)
await test('Full NEIGHBORS workflow equivalence', async () => {
  const text = 'NEIGHBORS\n  Claim Link Survey\nEXTRACT\nEDGES\nWALK 60 questions\nWALK 30 claims\nSOLO'
  const a = await execute(baseline, text),
    b = await execute(composite, text)
  fs.writeFileSync(path.join(output, 'full-workflow-baseline.json'), JSON.stringify(a, null, 2))
  fs.writeFileSync(path.join(output, 'full-workflow-composite.json'), JSON.stringify(b, null, 2))
  assert.deepEqual(b, a)
})
console.log = log
globalThis.Date = NativeDate
const report = {
  stage: 2,
  status: results.some(x => x.status === 'FAIL') ? 'FAIL' : 'PASS',
  passed: results.filter(x => x.status === 'PASS').length,
  failed: results.filter(x => x.status === 'FAIL').length,
  node: process.version,
  clockFixture: now,
  networkRequests: 0,
  results,
}
fs.writeFileSync(path.join(output, 'full-behavioral-equivalence.json'), JSON.stringify(report, null, 2))
for (const result of results)
  console.log(result.status, result.name, result.status === 'FAIL' ? result.message.substring(0, 200) : '')
console.log('Stage 2:', report.status, report.passed + ' passed', report.failed + ' failed')
const knownNames = ['Data workflow from identical pre-existing neighborhood', 'Full NEIGHBORS workflow equivalence']
const failures = results.filter(r => r.status === 'FAIL')
assert.deepEqual(
  failures.map(r => r.name),
  knownNames,
  'Unexpected selected-contract failure or vanished difference',
)
const prepopulated = failures[0]
assert.deepEqual(prepopulated.actual.state, prepopulated.expected.state)
assert.deepEqual(prepopulated.actual.trace.batches, prepopulated.expected.trace.batches)
assert.equal(prepopulated.actual.trace.statuses.length, 5)
assert.equal(prepopulated.expected.trace.statuses.length, 3)
const full = failures[1]
assert.notDeepEqual(full.actual.state.neighborhood, full.expected.state.neighborhood)
assert.deepEqual(full.actual.trace.publications, full.expected.trace.publications)
assert.deepEqual(full.actual.trace.batches, full.expected.trace.batches)
fs.writeFileSync(
  path.join(output, 'selected-contracts.json'),
  JSON.stringify(
    {
      status: 'PASS',
      selectedComparisonsPassed: report.passed,
      knownDifferencesVerified: 2,
      fullBehavioralEquivalence: 'FAIL',
      normalizationAdded: false,
    },
    null,
    2,
  ) + '\n',
)
console.log('Selected contracts PASS; full equivalence remains FAIL with two independently verified differences.')
