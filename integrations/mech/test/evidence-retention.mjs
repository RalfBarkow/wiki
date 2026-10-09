import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectAcceptance, recordAcceptance, writeAcceptance } from '../scripts/record-acceptance.mjs'
import { moduleIdentity, authoredFiles, moduleRoot, readJSON, sha } from '../scripts/build.mjs'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mech-record-contract-'))
const output = path.join(dir, 'records')
const artifacts = path.join(dir, 'artifacts')
const options = { artifactRoot: artifacts, supersedes: '2026-10-09-review-corrections' }
const twinsFile = path.join(artifacts, 'ambiguity/twins-results.json')
const historical = ['2026-10-08-initial', options.supersedes].map(id => {
  const file = path.join(moduleRoot, 'evidence/acceptance', id + '.json')
  return { file, hash: sha(fs.readFileSync(file)) }
})
let passed = 0
const check = (name, run) => {
  run()
  passed++
  console.log('PASS ' + name)
}
try {
  // Real recorder inputs from the executed module tests, not a test-side export.
  for (const name of [
    'contracts/test-report.json',
    'semantic/selected-contracts.json',
    'semantic/full-behavioral-equivalence.json',
    'ambiguity/twins-results.json',
    'renderer/test-report.json',
    'browser/negative-tests.json',
    'acceptance-contracts.json',
    'evidence-retention.json',
    'browser/results.json',
  ]) {
    fs.mkdirSync(path.dirname(path.join(artifacts, name)), { recursive: true })
    fs.copyFileSync(path.join(moduleRoot, '.artifacts', name), path.join(artifacts, name))
  }
  for (const profile of ['upstream', 'discourse'])
    fs.cpSync(path.join(moduleRoot, '.artifacts/contracts', profile), path.join(artifacts, 'contracts', profile), {
      recursive: true,
    })
  const originalTwins = fs.readFileSync(twinsFile)
  let first, record
  check('actual recorder retains separate four cases and four controls', () => {
    first = recordAcceptance(output, 'first-decision', options)
    record = readJSON(first)
    assert.equal(record.ambiguity.cases, 4)
    assert.equal(record.ambiguity.uninstrumentedControls, 4)
    assert.equal(record.ambiguity.caseEvidence.length, 4)
    assert.deepEqual(
      record.ambiguity.caseEvidence,
      readJSON(twinsFile).results.map(({ implementation, siteOrder, tracingMatchesUninstrumented }) => ({
        implementation,
        siteOrder,
        tracingMatchesUninstrumented,
      })),
    )
    assert.equal(record.ambiguity.producerEvidenceSha256, sha(JSON.stringify(readJSON(twinsFile))))
  })
  check('historical browser execution is identified without a new execution claim', () => {
    assert.equal(record.newBrowserExecution, false)
    assert.deepEqual(
      record.historicalBrowserObservation.testedModuleIdentity,
      readJSON(historical[1].file).moduleIdentity,
    )
    assert.deepEqual(record.moduleIdentity, moduleIdentity())
    assert.equal(record.supersedes.sha256, historical[1].hash)
    assert.equal(record.fullBehavioralEquivalence.status, 'FAIL')
    for (const profile of record.profiles)
      assert.deepEqual(
        profile.artifacts,
        readJSON(historical[1].file).profiles.find(p => p.profile === profile.profile).artifacts,
      )
  })
  const hash = sha(fs.readFileSync(first))
  check('actual recorder cannot overwrite a prior decision', () => {
    assert.throws(() => recordAcceptance(output, 'first-decision', options), /EEXIST/)
    assert.equal(sha(fs.readFileSync(first)), hash)
  })
  check('a second explicit decision appends', () => {
    recordAcceptance(output, 'second-decision', options)
    assert.equal(fs.readdirSync(output).length, 2)
  })
  function rejectSource(name, mutate, diagnostic) {
    check(name + '; no incomplete acceptance is written', () => {
      const before = fs.readdirSync(output)
      const source = JSON.parse(originalTwins)
      mutate(source)
      fs.writeFileSync(twinsFile, JSON.stringify(source))
      try {
        assert.throws(() => recordAcceptance(output, 'invalid-decision', options), diagnostic)
        assert.deepEqual(fs.readdirSync(output), before)
        assert.equal(fs.existsSync(path.join(output, 'invalid-decision.json')), false)
      } finally {
        fs.writeFileSync(twinsFile, originalTwins)
      }
    })
  }
  rejectSource(
    'missing producer count (stdout controls is not a fallback)',
    source => {
      delete source.untracedControls
      source.controls = 4
    },
    /Missing producer untracedControls/,
  )
  for (const value of [null, '4', true, 0, 3, 5, 4.5, [], {}])
    rejectSource(
      'malformed producer count ' + JSON.stringify(value),
      source => {
        source.untracedControls = value
      },
      /four independently executed uninstrumented controls/,
    )
  rejectSource(
    'missing cases',
    source => {
      delete source.cases
    },
    /four duplicate-slug cases/,
  )
  rejectSource(
    'inconsistent cases',
    source => {
      source.cases = 3
    },
    /four duplicate-slug cases/,
  )
  rejectSource(
    'missing result array',
    source => {
      delete source.results
    },
    /Missing ambiguity case evidence/,
  )
  rejectSource(
    'short result array',
    source => {
      source.results.pop()
    },
    /cardinality mismatch/,
  )
  rejectSource(
    'duplicate case',
    source => {
      source.results[3] = source.results[0]
    },
    /Duplicate ambiguity case/,
  )
  rejectSource(
    'control comparison not verified',
    source => {
      source.results[0].tracingMatchesUninstrumented = false
    },
    /Unverified uninstrumented control/,
  )
  rejectSource(
    'invalid site order',
    source => {
      source.results[0].siteOrder = ['alpha', 'alpha']
    },
    /Invalid case site order/,
  )
  rejectSource(
    'different site pair',
    source => {
      source.results[3].siteOrder[0] = 'third.fixture.test'
    },
    /Missing implementation\/site-order pair/,
  )
  rejectSource(
    'wrong implementation',
    source => {
      source.results[0].implementation = 'other'
    },
    /Invalid case implementation/,
  )
  rejectSource(
    'wrong source revision',
    source => {
      source.testedRevisions.upstream = 'unknown'
    },
    /revision mismatch/,
  )
  rejectSource(
    'missing semantics',
    source => {
      delete source.semantics
    },
    /malformed ambiguity semantics/,
  )
  rejectSource(
    'wrong executed bundle',
    source => {
      source.startedSources['discourse/client/mech.js'] = 'unknown'
    },
    /producer must execute the recorded composite bundle/,
  )
  check('direct writer rejects undefined exported count before creating output directory', () => {
    const invalid = structuredClone(record)
    invalid.ambiguity.uninstrumentedControls = undefined
    const absent = path.join(dir, 'never-created')
    assert.throws(
      () => writeAcceptance(absent, 'invalid', invalid),
      /four independently executed uninstrumented controls/,
    )
    assert.equal(fs.existsSync(absent), false)
  })
  check('default path refuses historical browser identity as current evidence', () => {
    assert.throws(() => collectAcceptance({ artifactRoot: artifacts }), /Expected values to be strictly deep-equal/)
  })
  check('correction rejects changed rebuilt artifact bytes', () => {
    const file = path.join(artifacts, 'contracts/discourse/client/mech.js')
    const before = fs.readFileSync(file)
    fs.appendFileSync(file, '\n// corruption')
    try {
      assert.throws(() => recordAcceptance(output, 'invalid-bytes', options), /Artifact bytes/)
    } finally {
      fs.writeFileSync(file, before)
    }
    assert.equal(fs.existsSync(path.join(output, 'invalid-bytes.json')), false)
  })
  check('unsafe record identifiers fail before writing', () => {
    assert.throws(() => recordAcceptance(output, '../escape', options), /safe record name/)
    assert.throws(() => collectAcceptance({ ...options, supersedes: '../escape' }), /safe record name/)
  })
  check('source-content digest preserves the acceptance-record exclusion', () => {
    assert.equal(
      moduleIdentity().sourceContentSha256,
      sha(JSON.stringify(authoredFiles().filter(([n]) => !n.startsWith('evidence/acceptance/')))),
    )
  })
  check('both historical acceptance records remain byte-identical', () => {
    for (const prior of historical) assert.equal(sha(fs.readFileSync(prior.file)), prior.hash)
    assert.equal(readJSON(historical[0].file).moduleIdentity.extensionCommitOid, null)
    assert.equal(readJSON(historical[0].file).fullBehavioralEquivalence.status, 'FAIL')
  })
  console.log('Durable evidence retention: ' + passed + ' PASS')
  fs.writeFileSync(
    path.join(moduleRoot, '.artifacts/evidence-retention.json'),
    JSON.stringify({ status: 'PASS', passed, node: process.version, moduleIdentity: moduleIdentity() }, null, 2) + '\n',
  )
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}
