import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { argumentsOf, buildProfiles, moduleRoot, readJSON, authoredFiles, moduleIdentity } from '../scripts/build.mjs'
import { evaluateAcceptance, contextOwner } from './browser-contracts.mjs'
const args = argumentsOf(),
  toolContract = readJSON(path.join(moduleRoot, 'test-tools.json'))
if (
  args.fault &&
  !['console-error', 'page-error', 'navigation', 'bundle-init', 'initialization', 'cleanup'].includes(args.fault)
)
  throw Error('Unknown controlled fault')
for (const required of ['repository', 'dependencies', 'playwright', 'browser', 'jquery'])
  if (!args[required]) throw Error('Explicit --' + required + ' input required; nothing is installed automatically')
assert.equal(
  readJSON(path.join(args.playwright, 'package.json')).version,
  toolContract.playwrightCoreVersion,
  'Playwright version',
)
const { chromium } = await import(pathToFileURL(path.join(args.playwright, 'index.mjs')))
const builtRoot = path.join(moduleRoot, '.artifacts/browser-build')
await buildProfiles({
  repository: args.repository,
  dependencies: args.dependencies,
  output: builtRoot,
  withBaseline: true,
})
const here = path.join(moduleRoot, '.artifacts/browser'),
  root = moduleRoot,
  origin = 'https://alpha.fixture.test'
fs.mkdirSync(here, { recursive: true })
const fixtureRoot = path.join(moduleRoot, 'test/fixtures')
const sha = b => crypto.createHash('sha256').update(b).digest('hex')
const read = p => fs.readFileSync(p)
const profileOf = name => (name === 'composite' ? 'discourse' : name)
const bundleFile = name => path.join(builtRoot, profileOf(name), 'client/mech.js')
const pins = readJSON(path.join(moduleRoot, 'sources.json'))
const bundleHashes = Object.fromEntries(['baseline', 'upstream', 'composite'].map(n => [n, sha(read(bundleFile(n)))]))
assert.equal(sha(read(args.jquery)), toolContract.jquerySha256, 'Trusted jQuery asset')
const authoredBefore = JSON.stringify(authoredFiles())
const all = {
  started: new Date().toISOString(),
  pin: pins.upstream.oid,
  moduleIdentity: moduleIdentity(),
  baseline: pins.behavioralBaseline.oid,
  artifacts: bundleHashes,
  configurations: {},
  tests: [],
  unexpectedRequests: [],
  browser: null,
  cleanup: [],
  node: process.version,
  fault: args.fault || null,
}
const runDirectory = fs.mkdtempSync(path.join(here, 'run-'))
const owner = contextOwner(all)
let upstreamControl
const check = (condition, message) => assert(condition, message)
async function test(name, configuration, fn) {
  try {
    const evidence = await fn()
    all.tests.push({ name, configuration, status: 'PASS', evidence })
  } catch (e) {
    all.tests.push({ name, configuration, status: 'FAIL', message: e.message, stack: e.stack })
  }
}
const jsonState = async page => page.evaluate(() => harness.snapshot())
async function openConfig(name) {
  const profile = path.join(runDirectory, 'profile-' + name)
  fs.mkdirSync(profile, { recursive: true })
  const tmp = path.join(runDirectory, 'tmp-' + name)
  fs.mkdirSync(tmp, { recursive: true })
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    timeout: 30000,
    executablePath: args.browser,
    serviceWorkers: 'block',
    acceptDownloads: false,
    proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
    env: { ...process.env, TMPDIR: tmp },
    args: [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--disable-default-apps',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=MediaRouter',
    ],
  })
  owner.register(context, name)
  let initialized = false
  try {
    all.browser = context.browser().version()
    const activity = { requests: [], pageErrors: [], consoleErrors: [] }
    all.configurations[name] = activity
    context.on('page', p => {
      p.on('pageerror', e => activity.pageErrors.push(e.message))
      p.on('console', m => {
        if (m.type() === 'error') activity.consoleErrors.push(m.text())
      })
    })
    await context.route('**/*', async route => {
      if (name === 'composite' && args.fault === 'navigation' && route.request().url() === origin + '/')
        return route.abort('failed')
      const req = route.request(),
        u = new URL(req.url())
      let body, contentType
      if (u.origin !== origin) {
        all.unexpectedRequests.push({ configuration: name, url: req.url(), method: req.method() })
        return route.abort('blockedbyclient')
      }
      const known = {
        '/': { path: path.join(here, 'index.html'), type: 'text/html' },
        '/jquery.js': { path: args.jquery, type: 'text/javascript' },
        '/fixture.js': { path: path.join(fixtureRoot, 'browser.js'), type: 'text/javascript' },
        '/bundle.mjs': { path: bundleFile(name), type: 'text/javascript' },
        '/plugins/mech/mech.css': { path: path.join(builtRoot, profileOf(name), 'client/mech.css'), type: 'text/css' },
        '/plugins/solo/dialog/': { path: path.join(fixtureRoot, 'solo-receiver.html'), type: 'text/html' },
      }
      if (known[u.pathname]) {
        body =
          name === 'composite' && args.fault === 'bundle-init' && u.pathname === '/bundle.mjs'
            ? Buffer.from('throw new Error("Controlled bundle import initialization failure");')
            : read(known[u.pathname].path)
        contentType = known[u.pathname].type
      } else if (u.pathname.endsWith('.json')) {
        const fixture = await route
          .request()
          .frame()
          .page()
          .evaluate(slug => harness.fixtures.pages[slug], u.pathname.slice(1, -5))
        if (!fixture) {
          all.unexpectedRequests.push({ configuration: name, url: req.url(), method: req.method() })
          return route.abort('blockedbyclient')
        }
        body = Buffer.from(JSON.stringify(fixture))
        contentType = 'application/json'
      } else if (u.pathname === '/favicon.ico') {
        body = Buffer.alloc(0)
        contentType = 'image/x-icon'
      } else {
        all.unexpectedRequests.push({ configuration: name, url: req.url(), method: req.method() })
        return route.abort('blockedbyclient')
      }
      activity.requests.push({
        url: req.url(),
        method: req.method(),
        status: 200,
        sha256: sha(body),
        bytes: body.length,
      })
      await route.fulfill({ status: 200, body, contentType, headers: { 'Cache-Control': 'no-store' } })
    })
    const page = context.pages()[0]
    page.on('pageerror', e => activity.pageErrors.push(e.message))
    page.on('console', m => {
      if (m.type() === 'error') activity.consoleErrors.push(m.text())
    })
    await page.goto(origin + '/', { waitUntil: 'load' })
    await page.evaluate(() => harness.load())
    if (name === 'composite' && args.fault === 'initialization')
      throw Error('Controlled subsequent initialization failure')
    initialized = true
    return { context, page, activity }
  } finally {
    if (!initialized) await owner.close(context)
  }
}
fs.writeFileSync(
  path.join(here, 'index.html'),
  '<!doctype html><meta charset="utf-8"><title>Trusted Mech fixture</title><link rel="icon" href="data:,"><script src="/jquery.js"></script><script src="/fixture.js"></script><div class="main"></div>',
)
async function ordinary(page) {
  const outputs = []
  for (const command of ['HELLO world', 'NEIGHBORS\nWALK 2 hubs']) {
    outputs.push(
      await page.evaluate(async command => {
        let seed = 123456
        const random = Math.random
        Math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
        try {
          return await harness.execute(command)
        } finally {
          Math.random = random
        }
      }, command),
    )
  }
  return outputs
}
const summary = x => {
  const state = structuredClone(x.state)
  delete state.context.blocks
  return { state, blocks: x.blocks.map(b => ({ text: b.text, html: b.html })), aspectSource: x.aspectSource }
} // Catalog additions are separately verified, not ordinary-command behavior.
for (const name of ['upstream', 'composite', 'baseline']) {
  let opened
  try {
    opened = await openConfig(name)
    const { page, context, activity } = opened
    if (name === 'composite' && args.fault === 'console-error')
      await page.evaluate(() => console.error('Controlled fixture console error'))
    if (name === 'composite' && args.fault === 'page-error') {
      const event = page.waitForEvent('pageerror')
      await page.evaluate(() =>
        setTimeout(() => {
          throw Error('Controlled fixture page error')
        }, 0),
      )
      await event
    }
    await test('Bundle loaded with expected plugin entry', name, async () => {
      const evidence = await page.evaluate(async () => ({
        pluginEmitMatches: window.plugins.mech.emit === harness.module.emit,
        pluginBindMatches: window.plugins.mech.bind === harness.module.bind,
        oneModuleInstance: (await import('/bundle.mjs')) === harness.module,
        catalog: Object.keys(harness.module.blocks),
        run: harness.module.run.toString(),
        tree: harness.module.tree.toString(),
        jquery: $.fn.jquery,
      }))
      check(
        evidence.pluginEmitMatches && evidence.pluginBindMatches && evidence.oneModuleInstance,
        'Plugin/module identity mismatch',
      )
      if (name === 'upstream') upstreamControl = evidence
      if (name === 'composite') {
        assert.equal(evidence.run, upstreamControl.run)
        assert.equal(evidence.tree, upstreamControl.tree)
        for (const op of ['EXTRACT', 'EDGES', 'DEBUG', 'CODE', 'SOLO'])
          check(evidence.catalog.includes(op), 'Missing ' + op)
      }
      return evidence
    })
    if (name === 'upstream') {
      all.ordinaryControl = (await ordinary(page)).map(summary)
      await test('Unmodified upstream rejects extension command', name, async () => {
        await page.evaluate(() => harness.execute('EXTRACT'))
        const diagnostics = await page.evaluate(() => harness.diagnostics())
        check(
          diagnostics.some(x => x.includes("EXTRACT doesn't name a block we know.")),
          'Unexpected extension availability',
        )
        return diagnostics
      })
    }
    if (name === 'composite') {
      await test('Extensions installed before first plugin emission', name, async () => {
        const emitted = await page.evaluate(() => harness.emit('DEBUG on'))
        const text = await page.evaluate(() => harness.block('DEBUG on').textContent)
        assert.equal(text, 'DEBUG on ⇒ on')
        return { ...emitted, text }
      })
      await test('Exactly one catalog and preserved upstream emitters', name, async () => {
        const meta = JSON.parse(read(path.join(builtRoot, 'discourse/metafile.json')))
        const count = Object.keys(meta.inputs).filter(x => x.endsWith('upstream/src/client/blocks.js')).length
        assert.equal(count, 1)
        const evidence = await page.evaluate(() => ({
          preserved: Object.entries(harness.module.originals)
            .filter(([n]) => n !== 'WALK')
            .every(([n, fn]) => harness.module.blocks[n].emit === fn),
          names: Object.keys(harness.module.blocks),
        }))
        check(evidence.preserved, 'Emitter replacement')
        return { ...evidence, upstreamCatalogModulesInBuild: count }
      })
      await test('Duplicate, collision and incompatible catalog rejection', name, async () => {
        const evidence = await page.evaluate(() => {
          const results = []
          try {
            harness.module.installDiscourse(harness.module.blocks)
          } catch (e) {
            results.push(e.message)
          }
          const collision = { ...harness.module.blocks }
          try {
            harness.module.installDiscourse(collision)
          } catch (e) {
            results.push(e.message)
          }
          const incompatible = { ...harness.module.blocks }
          for (const n of ['EXTRACT', 'EDGES', 'DEBUG']) delete incompatible[n]
          incompatible.WALK = { emit: null }
          try {
            harness.module.installDiscourse(incompatible)
          } catch (e) {
            results.push(e.message)
          }
          return {
            results,
            catalogStillInstalled: ['EXTRACT', 'EDGES', 'DEBUG'].every(
              n => typeof harness.module.blocks[n].emit === 'function',
            ),
          }
        })
        assert.deepEqual(evidence.results, [
          'Already installed',
          'Command collision: EXTRACT',
          'Incompatible emitter: WALK',
        ])
        check(evidence.catalogStillInstalled, 'Catalog corrupted')
        return evidence
      })
      await test('EXTRACT EDGES DEBUG dispatch with real DOM', name, async () => {
        const result = await page.evaluate(() => harness.execute('NEIGHBORS\nEXTRACT\nEDGES\nDEBUG on'))
        assert.equal(result.state.discourse.edges.length, 4)
        assert.equal(result.state.debug, true)
        assert.equal(result.visits.length, 4)
        assert.deepEqual(result.state.discourse.edges.map(e => e.role).sort(), [
          'claim',
          'oppose',
          'question',
          'support',
        ])
        check(result.blocks[2].html.includes('<details>'), 'EDGES table absent')
        return result
      })
      await test('EDGES destinations are safe in detached DOM', name, async () => {
        const evidence = await page.evaluate(async () => {
          const elem = document.createElement('div')
          const sites = [
            'normal.fixture.test:8080',
            'bad.fixture.test" onmouseover="fixture-only',
            "bad.fixture.test' onclick='fixture-only",
            'trusted.fixture.test@evil.fixture.test',
            'javascript:fixture',
            '//evil.fixture.test',
            'evil.fixture.test/path',
          ]
          await harness.module.blocks.EDGES.emit({
            elem,
            command: 'EDGES',
            args: [],
            state: {
              discourse: { edges: sites.map(site => ({ fromId: 'local', toId: site + '+target', role: 'claim' })) },
            },
          })
          // Detached DOM only: no navigation, event dispatch or payload execution.
          return {
            connected: elem.isConnected,
            anchors: [...elem.querySelectorAll('a')].map(a => a.getAttribute('href')),
            invalid: elem.querySelectorAll('.invalid-destination').length,
            eventAttributes: [...elem.querySelectorAll('*')].flatMap(e =>
              [...e.attributes].filter(a => /^on/i.test(a.name)).map(a => a.name),
            ),
          }
        })
        assert.equal(evidence.connected, false)
        assert.equal(evidence.invalid, 6)
        assert.deepEqual(evidence.eventAttributes, [])
        assert.deepEqual(
          evidence.anchors.filter(h => h !== '/view/local'),
          ['//normal.fixture.test:8080/view/target'],
        )
        return evidence
      })
      for (const role of ['question', 'claim', 'support', 'oppose'])
        await test('Role WALK ' + role, name, async () => {
          const result = await page.evaluate(role => harness.execute('NEIGHBORS\nEXTRACT\nWALK 1 ' + role), role)
          const aspects = result.state.aspect
          assert.equal(aspects.length, 1)
          assert.equal(aspects[0].result.length, 1)
          assert.equal(aspects[0].result[0].name, role[0].toUpperCase() + role.slice(1) + ' Root')
          assert.equal(result.aspectSource.length, 1)
          return result
        })
      await test('Extension error diagnostics', name, async () => {
        const results = []
        for (const command of ['EXTRACT', 'EDGES', 'DEBUG invalid', 'WALK questions']) {
          await page.evaluate(command => harness.execute(command), command)
          results.push({ command, diagnostic: await page.evaluate(() => harness.diagnostics()) })
        }
        check(
          results.every(r => r.diagnostic.length > 0),
          'Missing diagnostics',
        )
        return results
      })
      await test('Ordinary WALK and HELLO match upstream control', name, async () => {
        const result = (await ordinary(page)).map(summary)
        assert.deepEqual(result, all.ordinaryControl)
        return result
      })
    }
    if (name !== 'baseline') {
      const code =
        'globalThis.codeFixtureEvaluations++; export function named(value) { this.trustedValue={value}; return "trusted:"+value; }'
      await test('CODE named export through actual CLICK emission', name, async () => {
        await page.evaluate(code => harness.emit('CLICK\n  CODE named accepted', { codes: [code], remote: true }), code)
        await page.locator('button.button').click()
        await page.waitForFunction(() => document.body.textContent.includes('trusted:accepted'))
        const result = await page.evaluate(() => ({
          text: document.body.textContent,
          evaluations: codeFixtureEvaluations,
          catalog: harness.module.blocks.CODE.emit === harness.module.originals?.CODE || !harness.module.originals,
        }))
        check(result.catalog, 'CODE replaced')
        return result
      })
      await test('CODE named export through actual TICK', name, async () => {
        await page.evaluate(code => harness.execute('TICK 1\n  CODE named tick', {}, { codes: [code] }), code)
        await page.locator('button.button').click()
        await page.waitForFunction(() => harness.prepared.state.trustedValue?.value === 'tick', { timeout: 5000 })
        await page.waitForFunction(() => harness.prepared.state.tick === undefined, { timeout: 5000 })
        const result = await jsonState(page)
        assert.deepEqual(result.state.trustedValue, { value: 'tick' })
        return result
      })
      for (const [label, opts, permitted] of [
        ['unowned direct', { owner: false, remote: false }, false],
        ['owned local', { owner: true, remote: false }, true],
        ['owned remote', { owner: true, remote: true }, false],
        ['truthy internal initiator', { owner: false, remote: false, initiator: 'not-a-click-token' }, true],
      ])
        await test('CODE guard: ' + label, name, async () => {
          const before = await page.evaluate(() => codeFixtureEvaluations)
          const result = await page.evaluate(
            ({ code, opts }) => harness.execute('CODE named guarded', {}, { ...opts, codes: [code] }),
            { code, opts },
          )
          const diagnostics = await page.evaluate(() => harness.diagnostics())
          const after = await page.evaluate(() => codeFixtureEvaluations)
          if (permitted) {
            assert.deepEqual(result.state.trustedValue, { value: 'guarded' })
            check(result.blocks[0].text.includes('trusted:guarded'), 'No result')
          } else {
            check(
              diagnostics.some(x => x.includes('must be run by CLICK or TICK')),
              'Guard missing',
            )
            assert.equal(after, before)
            check(!result.state.trustedValue, 'Rejected code ran')
          }
          return { options: opts, permitted, result, diagnostics, evaluationsBefore: before, evaluationsAfter: after }
        })
      for (const [label, source, command, expected] of [
        ['missing export', 'export function present() {}', 'CODE absent', 'Expected export of function "absent".'],
        [
          'trusted throw',
          'export function broken() { throw new Error("trusted fixture failure"); }',
          'CODE broken',
          'trusted fixture failure',
        ],
        ['syntax failure', 'export function broken( {', 'CODE broken', 'Unexpected'],
      ])
        await test('CODE diagnostic: ' + label, name, async () => {
          await page.evaluate(({ source, command }) => harness.execute(command, {}, { owner: true, codes: [source] }), {
            source,
            command,
          })
          const diagnostics = await page.evaluate(() => harness.diagnostics())
          check(
            diagnostics.some(x => x.includes(expected)),
            'Unexpected diagnostic ' + JSON.stringify(diagnostics),
          )
          return diagnostics
        })
    }
    if (name === 'composite' || name === 'baseline') {
      const retained = JSON.parse(read(path.join(fixtureRoot, 'retained-solo.json')))
      const aspects = retained.state.aspect
      const expected = retained.trace.batches[0].data
      await test(
        'SOLO batch delivery' + (name === 'composite' ? ' and real status/reset lifecycle' : ''),
        name,
        async () => {
          await page.evaluate(aspect => harness.execute('CLICK\n  SLEEP 1\n  SOLO', { aspect }), aspects)
          const popupPromise = context.waitForEvent('page')
          await page.locator('button').filter({ hasText: '▶' }).first().click()
          const popup = await popupPromise
          await popup.waitForFunction(() => window.received?.length === 1, { timeout: 10000 })
          const first = await popup.evaluate(() => window.received[0].data)
          assert.deepEqual(first, expected)
          let lifecycle
          if (name === 'composite') {
            const initial = await page.evaluate(() => {
              const solo = harness.block('SOLO')
              window.priorSoloStatus = solo.querySelector('span.status')
              return { html: solo.innerHTML, status: window.priorSoloStatus?.textContent }
            })
            assert.equal(initial.status, ' ⇒ 2 sources, 4 aspects')
            await page.locator('button.button').filter({ hasText: '▶' }).first().click()
            const reset = await page.evaluate(() => ({
              previousConnected: priorSoloStatus.isConnected,
              currentStatus: harness.block('SOLO').querySelector('span.status')?.textContent ?? null,
              text: harness.block('SOLO').textContent,
            }))
            assert.equal(reset.previousConnected, false)
            assert.equal(reset.currentStatus, null)
            await popup.waitForFunction(() => window.received?.length === 2, { timeout: 10000 })
            const second = await popup.evaluate(() => window.received[1].data)
            assert.deepEqual(second, expected)
            const repeated = await page.evaluate(() => ({
              html: harness.block('SOLO').innerHTML,
              newStatus: harness.block('SOLO').querySelector('span.status') !== priorSoloStatus,
            }))
            check(repeated.newStatus, 'Status was not replaced')
            assert.equal(context.pages().filter(p => p.url().includes('/plugins/solo/dialog/')).length, 1)
            lifecycle = { initial, reset, repeated, receiverReused: true, deliveries: 2 }
          }
          await popup.close()
          return { batch: first, matchesRetainedBaseline: true, lifecycle }
        },
      )
      if (name === 'composite')
        await test('SOLO missing-aspect diagnostic', name, async () => {
          await page.evaluate(() => harness.execute('SOLO'))
          const diagnostic = await page.evaluate(() => harness.diagnostics())
          check(
            diagnostic.some(x => x.includes('expects "aspect" state')),
            'Missing SOLO diagnostic',
          )
          return diagnostic
        })
    }
  } catch (e) {
    all.tests.push({
      name: 'Configuration initialization/execution',
      configuration: name,
      status: 'FAIL',
      message: e.message,
      stack: e.stack,
    })
    break // A missing control is a test-environment failure, not an ordinary-command mismatch.
  } finally {
    if (opened) await owner.close(opened.context, name === 'composite' && args.fault === 'cleanup')
  }
}
await owner.closeRemaining()
all.sourceIntegrity =
  JSON.stringify(authoredFiles()) === authoredBefore &&
  Object.entries(bundleHashes).every(([name, hash]) => sha(read(bundleFile(name))) === hash)
all.finished = new Date().toISOString()
all.artifactDigests = {
  fixture: sha(read(path.join(fixtureRoot, 'browser.js'))),
  receiver: sha(read(path.join(fixtureRoot, 'solo-receiver.html'))),
  runner: sha(read(new URL(import.meta.url))),
  jquery: sha(read(args.jquery)),
}
all.dependencies = Object.fromEntries(
  ['esbuild', 'acorn', 'marked', 'universal-ticker'].map(name => [
    name,
    readJSON(path.join(args.dependencies, name, 'package.json')).version,
  ]),
)
all.playwright = readJSON(path.join(args.playwright, 'package.json')).version
all.externalTools = {
  playwright: { version: all.playwright, contentSha256: sha(JSON.stringify(authoredFiles(args.playwright))) },
  browser: { version: all.browser, executableSha256: sha(read(args.browser)) },
  jquery: { version: toolContract.jqueryVersion, sha256: sha(read(args.jquery)) },
}
Object.assign(all, evaluateAcceptance(all))
all.priorBehavioralAcceptance = 'FAIL'
all.diagnosticRecord = path.relative(moduleRoot, path.join(runDirectory, 'results.json'))
fs.writeFileSync(path.join(runDirectory, 'results.json'), JSON.stringify(all, null, 2) + '\n', { flag: 'wx' })
fs.writeFileSync(path.join(here, 'results.json'), JSON.stringify(all, null, 2) + '\n')
for (const t of all.tests) console.log(t.status, t.configuration, t.name, t.message || '')
console.log(
  JSON.stringify(
    {
      browser: all.browser,
      aggregateAcceptance: all.aggregateAcceptance,
      acceptance: all.acceptance,
      cleanup: all.cleanup,
      diagnosticRecord: all.diagnosticRecord,
      passed: all.tests.filter(t => t.status === 'PASS').length,
      failed: all.tests.filter(t => t.status === 'FAIL').length,
      unexpectedRequests: all.unexpectedRequests,
      pageErrors: Object.fromEntries(Object.entries(all.configurations).map(([k, v]) => [k, v.pageErrors])),
    },
    null,
    2,
  ),
)
process.exitCode = all.exitCode
