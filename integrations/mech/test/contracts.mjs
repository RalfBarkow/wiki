import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  argumentsOf,
  buildProfiles,
  moduleRoot,
  readJSON,
  sha,
  verifySnapshot,
  materialize,
  pins,
} from '../scripts/build.mjs'
const args = argumentsOf(),
  output = path.join(moduleRoot, '.artifacts/contracts')
const first = await buildProfiles({ repository: args.repository, dependencies: args.dependencies, output })
const second = await buildProfiles({
  repository: args.repository,
  dependencies: args.dependencies,
  output: output + '-repeat',
})
let passed = 0
const checks = []
const check = (name, fn) => {
  fn()
  passed++
  checks.push(name)
}
check('Both profiles reproduce byte-identical artifacts', () => {
  for (let i = 0; i < first.length; i++) {
    assert.deepEqual(first[i], second[i])
    for (const file of ['client/mech.js', 'client/mech.css', 'metafile.json', 'provenance.json'])
      assert.equal(
        sha(fs.readFileSync(path.join(output, first[i].profile, file))),
        sha(fs.readFileSync(path.join(output + '-repeat', first[i].profile, file))),
      )
  }
})
for (const profile of pins.profiles) {
  const independent = await buildProfiles({
    repository: args.repository,
    dependencies: args.dependencies,
    output: output + '-' + profile,
    profiles: [profile],
  })
  check('Independent ' + profile + ' selection', () => {
    assert.equal(independent.length, 1)
    assert.equal(independent[0].profile, profile)
    assert.deepEqual(
      independent[0],
      first.find(x => x.profile === profile),
    )
    const meta = readJSON(path.join(output + '-' + profile, profile, 'metafile.json'))
    assert.equal(
      Object.keys(meta.inputs).some(x => x.endsWith('src/discourse.mjs')),
      profile === 'discourse',
    )
  })
}
const up = await import(pathToFileURL(path.join(output, 'upstream/client/mech.js'))),
  composite = await import(pathToFileURL(path.join(output, 'discourse/client/mech.js')))
check('Profile isolation', () => {
  for (const n of ['EXTRACT', 'EDGES', 'DEBUG']) {
    assert(!Object.hasOwn(up.blocks, n))
    assert.equal(typeof composite.blocks[n].emit, 'function')
  }
})
check('Parser and dispatcher unchanged', () => {
  assert.equal(up.run.toString(), composite.run.toString())
  assert.equal(up.tree.toString(), composite.tree.toString())
})
check('Original upstream emitter identities preserved', () => {
  for (const [name, fn] of Object.entries(composite.originals))
    if (name !== 'WALK') assert.equal(composite.blocks[name].emit, fn)
})
check('Exactly one catalog module in each build', () => {
  for (const profile of ['upstream', 'discourse']) {
    const meta = readJSON(path.join(output, profile, 'metafile.json'))
    assert.equal(Object.keys(meta.inputs).filter(x => x.endsWith('upstream/src/client/blocks.js')).length, 1)
  }
})
check('Uncommitted source identity', () => {
  for (const x of first) {
    assert.equal(x.recipe.wiki.baseCommitOid, pins.wiki.baseCommitOid)
    assert.equal(x.recipe.wiki.extensionCommitOid, null)
    assert.equal(x.recipe.wiki.workingTree, true)
    assert.equal(x.recipe.wiki.modulePath, 'integrations/mech')
  }
})
const names = ['WALK', 'CODE', 'SOLO', 'LISTEN', 'MESSAGE']
const catalog = () => Object.fromEntries(names.map(n => [n, { emit: x => x }]))
for (const n of ['EXTRACT', 'EDGES', 'DEBUG'])
  check('Collision ' + n + ' is atomic', () => {
    const c = catalog()
    c[n] = { emit() {} }
    const before = { ...c }
    assert.throws(() => composite.installDiscourse(c), /collision/)
    assert.deepEqual(c, before)
  })
for (const n of names)
  check('Incompatible emitter ' + n + ' is atomic', () => {
    const c = catalog()
    c[n] = { emit: null }
    const before = { ...c }
    assert.throws(() => composite.installDiscourse(c), /Incompatible/)
    assert.deepEqual(c, before)
  })
check('Duplicate registration', () => {
  const c = catalog()
  composite.installDiscourse(c)
  assert.throws(() => composite.installDiscourse(c), /Already/)
})
check('Readonly registry rejection', () => {
  const c = catalog()
  Object.freeze(c)
  assert.throws(() => composite.installDiscourse(c))
  assert.deepEqual(Object.keys(c), names)
})
check('Ordinary WALK invocation and return identity', () => {
  const c = catalog(),
    stuff = { command: 'WALK 2 hubs', initiator: 'click', state: {}, body: [] }
  let got
  const value = Promise.resolve('unchanged')
  c.WALK.emit = x => ((got = x), value)
  composite.installDiscourse(c)
  assert.equal(c.WALK.emit(stuff), value)
  assert.equal(got, stuff)
})
check('Wrong snapshot is rejected', () =>
  assert.throws(() => verifySnapshot(path.join(moduleRoot, 'src'), pins.upstream)),
)
check('Source byte corruption is rejected', () => {
  const target = path.join(output, 'integrity-source')
  materialize(args.repository, pins.upstream, target)
  fs.appendFileSync(path.join(target, 'src/client/blocks.js'), '\n// fixture corruption\n')
  assert.throws(() => verifySnapshot(target, pins.upstream), /Source integrity/)
  fs.rmSync(target, { recursive: true, force: true })
})
await assert.rejects(
  buildProfiles({
    repository: args.repository,
    dependencies: args.dependencies,
    output: output + '-invalid',
    profiles: ['automatic'],
  }),
  /Unknown profile/,
)
passed++
checks.push('Unknown profiles fail closed')
await assert.rejects(buildProfiles({ dependencies: args.dependencies }), /repository/)
passed++
checks.push('Missing source authority input fails closed')
fs.writeFileSync(
  path.join(output, 'test-report.json'),
  JSON.stringify({ status: 'PASS', passed, checks, profiles: first }, null, 2) + '\n',
)
console.log('Catalog/build contracts:', passed, 'PASS')
