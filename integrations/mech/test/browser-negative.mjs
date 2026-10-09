import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { moduleRoot, readJSON } from '../scripts/build.mjs'
const supplied = process.argv.slice(2),
  reports = []
for (const fault of ['console-error', 'page-error', 'navigation', 'bundle-init', 'initialization', 'cleanup']) {
  const child = spawnSync(process.execPath, ['test/browser.mjs', ...supplied, '--fault', fault], {
    cwd: moduleRoot,
    encoding: 'utf8',
    timeout: 150000,
    maxBuffer: 8 * 1024 * 1024,
  })
  assert(!child.error, child.error?.message)
  const report = readJSON(path.join(moduleRoot, '.artifacts/browser/results.json'))
  assert.equal(report.fault, fault, child.stderr)
  assert.equal(report.sourceIntegrity, true, 'Controlled faults must not be confounded by source or artifact changes')
  assert.equal(child.status, 1, 'Rejected acceptance must exit 1')
  assert.equal(report.acceptance.T9.status, 'FAIL')
  assert.equal(report.aggregateAcceptance, 'FAIL')
  assert(report.cleanup.length > 0)
  assert(
    report.cleanup.every(c => c.closed && c.closeObserved),
    'Every actually launched context must be closed',
  )
  assert.equal(report.unexpectedRequests.length, 0)
  if (fault === 'console-error' || fault === 'page-error') {
    assert.equal(
      report.tests.filter(t => t.status === 'FAIL').length,
      0,
      'Isolate criterion failure from individual failures',
    )
    const errors = report.configurations.composite[fault === 'console-error' ? 'consoleErrors' : 'pageErrors']
    assert(errors.some(x => x.includes('Controlled fixture')))
  } else if (fault === 'cleanup') {
    assert(report.cleanup.some(c => c.attempts.some(a => a.status === 'FAIL')))
    assert.equal(report.cleanupSatisfied, false, 'Recovered closure must not erase a failed cleanup operation')
  } else {
    assert(report.tests.some(t => t.name === 'Configuration initialization/execution' && t.status === 'FAIL'))
    assert(report.cleanup.some(c => c.configuration === 'composite' && c.closed))
  }
  reports.push({
    fault,
    expectedChildExit: child.status,
    criterion: report.acceptance.T9.status,
    aggregate: report.aggregateAcceptance,
    actuallyClosed: report.cleanup.length,
    record: report.diagnosticRecord,
    status: 'PASS',
    sourceIdentity: report.moduleIdentity,
  })
  console.log('PASS controlled fault:', fault, 'child exit', child.status, 'closed', report.cleanup.length)
}
fs.writeFileSync(
  path.join(moduleRoot, '.artifacts/browser/negative-tests.json'),
  JSON.stringify({ status: 'PASS', passed: reports.length, reports }, null, 2) + '\n',
)
