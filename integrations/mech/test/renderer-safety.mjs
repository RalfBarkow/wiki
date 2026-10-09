import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { argumentsOf, buildProfiles, moduleRoot } from '../scripts/build.mjs'
const args = argumentsOf(),
  output = path.join(moduleRoot, '.artifacts/renderer')
await buildProfiles({ repository: args.repository, dependencies: args.dependencies, output })
const { blocks } = await import(pathToFileURL(path.join(output, 'discourse/client/mech.js')))
const cases = [
  ...[
    'example.org',
    'Wiki.Example.org',
    'localhost',
    'localhost:3000',
    '127.0.0.1:8080',
    '[::1]:3000',
    'xn--bcher-kva.example',
    'bücher.example',
    'example.org.',
    '_wiki.example',
    'foo&bar.example',
    '-example.org',
    '[0:0:0:0:0:0:0:1]',
  ].map(site => ({ site, valid: true })),
  ...[
    'https://example.org',
    '//example.org',
    'example.org/path',
    'example.org?x=1',
    'example.org#x',
    'evil.example@trusted.example',
    'example.org\\evil',
    'example.org%22',
    'example.org" onmouseover="fixture-only',
    "example.org' onclick='fixture-only",
    'example.org><img',
    'javascript:fixture',
    'data:text/html,fixture',
    'example.org\n',
    'example.org:0',
    'example.org:65536',
    'example.org:',
    '127.1',
    '0x7f000001',
  ].map(site => ({ site, valid: false })),
]
let passed = 0
const results = []
for (const { site, valid } of cases) {
  // Carry reference.site through the original extraction path before rendering.
  const state = {
    neighborhood: [{ domain: 'origin.fixture.test', slug: 'root', date: 1 }],
    api: {
      status() {},
      jfetch: async () => ({
        story: [
          { type: 'pagefold', text: 'Claim' },
          { type: 'reference', site, slug: 'target' },
        ],
      }),
    },
  }
  await blocks.EXTRACT.emit({ elem: {}, command: 'EXTRACT', args: [], state })
  const elem = {}
  await blocks.EDGES.emit({ elem, command: 'EDGES', args: [], state })
  const destination = state.discourse.edges[0].toId
  assert.equal(destination, site + '+target')
  if (valid) assert(elem.innerHTML.includes(`href="//${site.replace(/&/g, '&amp;')}/view/target"`), site)
  else {
    assert(elem.innerHTML.includes('invalid destination'), site)
    assert(!elem.innerHTML.includes(`href="//${site}`), site)
    assert(!elem.innerHTML.includes('onmouseover='))
    assert(!elem.innerHTML.includes('onclick='))
  }
  results.push({ site, valid, status: 'PASS' })
  passed++
}
// Empty reference.site keeps the established source-site fallback; an explicit empty authority is inert.
const fallback = {
  neighborhood: [{ domain: 'origin.fixture.test', slug: 'root', date: 1 }],
  api: {
    status() {},
    jfetch: async () => ({
      story: [
        { type: 'pagefold', text: 'Claim' },
        { type: 'reference', site: '', slug: 'target' },
      ],
    }),
  },
}
await blocks.EXTRACT.emit({ elem: {}, command: 'EXTRACT', args: [], state: fallback })
assert.equal(fallback.discourse.edges[0].toId, 'origin.fixture.test+target')
passed++
const emptyAuthority = {}
await blocks.EDGES.emit({
  elem: emptyAuthority,
  command: 'EDGES',
  args: [],
  state: { discourse: { edges: [{ fromId: 'local', toId: '+target', role: 'claim' }] } },
})
assert(emptyAuthority.innerHTML.includes('invalid destination'))
passed++
const elem = {}
await blocks.EDGES.emit({
  elem,
  command: 'EDGES',
  args: [],
  state: {
    discourse: {
      edges: [{ fromId: 'local-slug', toId: 'normal.example+target with "quotes" & \'apostrophe\'', role: 'claim' }],
      pagesById: { 'local-slug': { title: '<label> & safe' } },
    },
  },
})
assert(elem.innerHTML.includes('href="/view/local-slug"'))
assert(
  elem.innerHTML.includes('href="//normal.example/view/target%20with%20%22quotes%22%20%26%20&#39;apostrophe&#39;"'),
)
assert(elem.innerHTML.includes('&lt;label&gt; &amp; safe'))
passed++
fs.writeFileSync(
  path.join(output, 'test-report.json'),
  JSON.stringify({ status: 'PASS', passed, cases: results, payloadsExecuted: false }, null, 2) + '\n',
)
console.log('Renderer safety:', passed, 'PASS; adversarial data never executed')
