import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { moduleRoot } from '../scripts/build.mjs'
import { EventEmitter } from 'node:events'
import { contextOwner, evaluateAcceptance, requiredChecks } from './browser-contracts.mjs'
const good = () => ({
  tests: Object.entries(requiredChecks).flatMap(([configuration, names]) =>
    names.map(name => ({ configuration, name, status: 'PASS' })),
  ),
  cleanup: ['upstream', 'composite', 'baseline'].map(configuration => ({
    configuration,
    closed: true,
    closeObserved: true,
    attempts: [{ status: 'PASS' }],
  })),
  configurations: Object.fromEntries(
    ['upstream', 'composite', 'baseline'].map(n => [n, { pageErrors: [], consoleErrors: [] }]),
  ),
  sourceIntegrity: true,
  unexpectedRequests: [],
})
let passed = 0
const check = (name, fn) => {
  fn()
  passed++
  console.log('PASS', name)
}
check('Complete acceptance exits zero', () => assert.equal(evaluateAcceptance(good()).exitCode, 0))
for (const mutation of [
  r => r.tests.splice(0, 1),
  r => (r.tests.find(t => t.name.startsWith('CODE')).status = 'FAIL'),
  r => r.configurations.composite.consoleErrors.push('Controlled'),
  r => r.configurations.upstream.pageErrors.push('Controlled'),
  r => r.unexpectedRequests.push({ url: 'https://blocked.fixture.test' }),
  r => (r.cleanup[0].closed = false),
  r => r.cleanup[0].attempts.push({ status: 'FAIL' }),
  r => (r.sourceIntegrity = false),
  r => delete r.configurations.baseline,
  r => r.tests.push({ ...r.tests[0] }),
  r => (r.tests = []),
  r => (r.cleanup = []),
])
  check('Incomplete or erroneous acceptance fails closed', () => {
    const r = good()
    mutation(r)
    assert.equal(evaluateAcceptance(r).exitCode, 1)
  })
const report = { cleanup: [] },
  owner = contextOwner(report),
  context = new EventEmitter()
context.close = async () => context.emit('close')
owner.register(context, 'owned')
await owner.close(context, true)
assert.equal(report.cleanup[0].closed, false)
await owner.closeRemaining()
assert.equal(report.cleanup[0].closed, true)
assert.deepEqual(
  report.cleanup[0].attempts.map(a => a.status),
  ['FAIL', 'PASS'],
)
passed++
await assert.rejects(owner.close(new EventEmitter()), /unowned/)
passed++
const silent = new EventEmitter()
silent.close = async () => {}
owner.register(silent, 'silent')
await owner.close(silent)
assert.equal(report.cleanup[1].closed, false)
assert.equal(report.cleanup[1].attempts[0].status, 'FAIL')
passed++
console.log('Acceptance/ownership contracts:', passed, 'PASS')

const output = path.join(moduleRoot, '.artifacts/acceptance-contracts.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify({ status: 'PASS', passed, node: process.version }, null, 2) + '\n')
