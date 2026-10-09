import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { argumentsOf, moduleRoot, moduleIdentity, readJSON, pins, sha } from './build.mjs'
function validateId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id))
    throw Error('Acceptance id must be an explicit safe record name')
}
function validateCases(cases, controls, results) {
  assert.equal(cases, 4, 'Expected four duplicate-slug cases')
  assert.equal(controls, 4, 'Expected four independently executed uninstrumented controls')
  assert.ok(Array.isArray(results), 'Missing ambiguity case evidence')
  assert.equal(results.length, cases, 'Ambiguity case cardinality mismatch')
  const keys = new Set()
  for (const result of results) {
    assert.ok(['baseline', 'composite'].includes(result?.implementation), 'Invalid case implementation')
    assert.ok(
      Array.isArray(result.siteOrder) &&
        result.siteOrder.length === 2 &&
        result.siteOrder.every(site => typeof site === 'string' && site.length > 0) &&
        result.siteOrder[0] !== result.siteOrder[1],
      'Invalid case site order',
    )
    assert.equal(result.tracingMatchesUninstrumented, true, 'Unverified uninstrumented control')
    keys.add(JSON.stringify([result.implementation, result.siteOrder]))
  }
  assert.equal(keys.size, 4, 'Duplicate ambiguity case evidence')
  const [a, b] = results[0].siteOrder
  for (const implementation of ['baseline', 'composite'])
    for (const order of [
      [a, b],
      [b, a],
    ])
      assert.ok(keys.has(JSON.stringify([implementation, order])), 'Missing implementation/site-order pair')
}
export function exportAmbiguity(twins) {
  assert.ok(twins && typeof twins === 'object', 'Missing ambiguity producer evidence')
  assert.ok(Object.hasOwn(twins, 'untracedControls'), 'Missing producer untracedControls')
  validateCases(twins.cases, twins.untracedControls, twins.results)
  assert.deepEqual(
    twins.testedRevisions,
    {
      baseline: pins.behavioralBaseline.oid,
      upstream: pins.upstream.oid,
    },
    'Ambiguity evidence revision mismatch',
  )
  for (const name of [
    'extractedEqualAcrossCases',
    'baselineSiteOrderInvariant',
    'compositeSiteOrderInvariant',
    'alphaFirstAspectsEqual',
    'betaFirstAspectsEqual',
    'alphaFirstBatchesEqual',
    'betaFirstBatchesEqual',
  ])
    assert.equal(typeof twins.semantics?.[name], 'boolean', 'Missing or malformed ambiguity semantics: ' + name)
  assert.equal(twins.networkAttempts, 0, 'Ambiguity evidence must remain offline')
  assert.equal(twins.browserExecuted, false, 'Ambiguity evidence is not a browser execution')
  return {
    semantics: twins.semantics,
    cases: twins.cases,
    uninstrumentedControls: twins.untracedControls,
    caseEvidence: twins.results.map(({ implementation, siteOrder, tracingMatchesUninstrumented }) => ({
      implementation,
      siteOrder,
      tracingMatchesUninstrumented,
    })),
    networkAttempts: twins.networkAttempts,
    testedRevisions: twins.testedRevisions,
    producerEvidenceSha256: sha(JSON.stringify(twins)),
    controlEvidence:
      'One independently executed uninstrumented run per case; producer asserts equality of neighborhood, extracted relations, aspects, publications, batches, errors, fetches, listeners and statuses. Separate control output captures are not retained.',
  }
}
export function writeAcceptance(directory, id, record) {
  validateId(id)
  assert.ok(record?.ambiguity, 'Missing exported ambiguity evidence')
  validateCases(record.ambiguity.cases, record.ambiguity.uninstrumentedControls, record.ambiguity.caseEvidence)
  const serialized = JSON.stringify(record, null, 2) + '\n'
  fs.mkdirSync(directory, { recursive: true })
  const target = path.join(directory, id + '.json')
  // Explicit append-only retention: even identical repeat decisions need a new id.
  fs.writeFileSync(target, serialized, { flag: 'wx' })
  return target
}
export function collectAcceptance({ artifactRoot = path.join(moduleRoot, '.artifacts'), supersedes } = {}) {
  const identity = moduleIdentity()
  const report = name => readJSON(path.join(artifactRoot, name))
  let prior, priorReference
  if (supersedes !== undefined) {
    validateId(supersedes)
    const file = path.join(moduleRoot, 'evidence/acceptance', supersedes + '.json')
    prior = readJSON(file)
    priorReference = { file: 'evidence/acceptance/' + supersedes + '.json', sha256: sha(fs.readFileSync(file)) }
    assert.equal(prior.kind, 'review-corrections-acceptance', 'Correction requires the prior reviewed decision')
    assert.ok(
      !Object.hasOwn(prior.ambiguity, 'uninstrumentedControls'),
      'Only the missing control export is superseded',
    )
    for (const name of ['authority', 'baseCommitOid', 'modulePath', 'moduleVersion', 'lockfileSha256'])
      assert.equal(identity[name], prior.moduleIdentity[name], 'Correction changed source authority or dependencies')
    assert.deepEqual(prior.upstream, { authority: pins.upstream.authority, oid: pins.upstream.oid })
    assert.deepEqual(prior.behavioralBaseline, {
      authority: pins.behavioralBaseline.authority,
      oid: pins.behavioralBaseline.oid,
    })
  }
  const browserIdentity = prior ? prior.moduleIdentity : identity
  const contracts = report('contracts/test-report.json')
  const selected = report('semantic/selected-contracts.json')
  const full = report('semantic/full-behavioral-equivalence.json')
  const twins = report('ambiguity/twins-results.json')
  const ambiguity = exportAmbiguity(twins)
  const renderer = report('renderer/test-report.json')
  const negatives = report('browser/negative-tests.json')
  const acceptanceContracts = report('acceptance-contracts.json')
  const retention = report('evidence-retention.json')
  const browser = report('browser/results.json')
  assert.equal(browser.aggregateAcceptance, 'PASS')
  assert.equal(browser.fault, null)
  assert.deepEqual(browser.moduleIdentity, browserIdentity)
  for (const negative of negatives.reports)
    assert.deepEqual(negative.sourceIdentity, browserIdentity, 'Negative tests must identify the same tested module')
  for (const report of [contracts, renderer, negatives, acceptanceContracts, retention])
    assert.equal(report.status, 'PASS')
  assert.equal(full.status, 'FAIL', 'Do not promote strict equivalence')
  const profiles = ['upstream', 'discourse'].map(profile => {
    const directory = path.join(artifactRoot, prior ? 'contracts' : 'browser-build', profile)
    const manifest = readJSON(path.join(directory, 'provenance.json'))
    assert.deepEqual(manifest.recipe.wiki, identity, 'Acceptance must describe the current tested source')
    assert.deepEqual(contracts.profiles.find(p => p.profile === profile).recipe.wiki, identity)
    assert.equal(
      manifest.artifacts['client/mech.js'].sha256,
      browser.artifacts[profile === 'discourse' ? 'composite' : profile],
    )
    for (const [file, artifact] of Object.entries(manifest.artifacts))
      assert.equal(
        sha(fs.readFileSync(path.join(directory, file))),
        artifact.sha256,
        'Artifact bytes: ' + profile + '/' + file,
      )
    if (prior) {
      const historical = prior.profiles.find(p => p.profile === profile)
      assert.deepEqual(manifest.source, historical.source, 'Pinned source must match historical browser evidence')
      assert.deepEqual(
        manifest.artifacts,
        historical.artifacts,
        'Rebuilt artifacts must match historical browser evidence',
      )
      assert.deepEqual(manifest.recipe.dependencies, historical.build.dependencies)
    }
    if (profile === 'discourse')
      assert.equal(
        twins.startedSources?.['discourse/client/mech.js'],
        manifest.artifacts['client/mech.js'].sha256,
        'Ambiguity producer must execute the recorded composite bundle',
      )
    return {
      profile,
      source: manifest.source,
      artifacts: manifest.artifacts,
      build: {
        node: manifest.recipe.node,
        platform: manifest.recipe.platform,
        arch: manifest.recipe.arch,
        dependencies: manifest.recipe.dependencies,
      },
    }
  })
  return {
    schemaVersion: 1,
    kind: prior ? 'acceptance-evidence-export-correction' : 'review-corrections-acceptance',
    ...(prior
      ? {
          supersedes: {
            ...priorReference,
            scope:
              'Restores the omitted ambiguity.uninstrumentedControls export. Prior decisions and browser observations remain historical and unchanged.',
          },
          newBrowserExecution: false,
          historicalBrowserObservation: { ...priorReference, testedModuleIdentity: browserIdentity },
          evidenceStatus: {
            catalog: 'fresh source-composition and reproducibility execution',
            ambiguity: 'fresh offline four cases and four paired controls',
            evidenceRetention: 'fresh recorder/export regression execution',
            browser: 'retained historical observation; rebuilt artifacts verified identical',
            renderer: 'retained historical regression',
            negativeBrowser: 'retained historical observations',
            acceptanceContracts: 'retained historical regression',
            selectedSemantics: 'retained historical comparison',
            fullBehavioralEquivalence: 'retained historical FAIL',
          },
        }
      : {}),
    recordedAt: new Date().toISOString(),
    moduleIdentity: identity,
    upstream: { authority: pins.upstream.authority, oid: pins.upstream.oid },
    behavioralBaseline: { authority: pins.behavioralBaseline.authority, oid: pins.behavioralBaseline.oid },
    profiles,
    commands: [
      'node test/contracts.mjs --repository $MECH_REPOSITORY --dependencies $MECH_DEPENDENCIES',
      'node test/semantic.mjs --repository $MECH_REPOSITORY --dependencies $MECH_DEPENDENCIES',
      'node test/ambiguity.mjs --repository $MECH_REPOSITORY --dependencies $MECH_DEPENDENCIES',
      'node test/renderer-safety.mjs --repository $MECH_REPOSITORY --dependencies $MECH_DEPENDENCIES',
      'node test/acceptance-contracts.mjs',
      'node test/evidence-retention.mjs',
      ...['browser-negative', 'browser'].map(
        name =>
          `node test/${name}.mjs --repository $MECH_REPOSITORY --dependencies $MECH_DEPENDENCIES --playwright $PLAYWRIGHT_CORE --browser $BROWSER --jquery $JQUERY`,
      ),
    ],
    checks: {
      catalog: contracts.passed,
      acceptanceContracts: acceptanceContracts.passed,
      evidenceRetention: retention.passed,
      renderer: renderer.passed,
      browser: {
        passed: browser.tests.filter(t => t.status === 'PASS').length,
        failed: browser.tests.filter(t => t.status === 'FAIL').length,
        acceptance: browser.acceptance,
        aggregate: browser.aggregateAcceptance,
        exitCode: browser.exitCode,
        cleanup: browser.cleanup,
        ownedContextsClosed: browser.ownedContextsClosed,
        unexpectedRequests: browser.unexpectedRequests.length,
        pageErrors: Object.values(browser.configurations).flatMap(c => c.pageErrors),
        consoleErrors: Object.values(browser.configurations).flatMap(c => c.consoleErrors),
      },
      negativeBrowser: negatives.reports,
    },
    selectedSemantics: selected,
    fullBehavioralEquivalence: { status: full.status, passed: full.passed, failed: full.failed },
    ambiguity,
    tools: { browserRunnerNode: browser.node, ...browser.externalTools },
    limitations: [
      'Full behavioral equivalence remains FAIL: NEIGHBORS ordering and SOLO API-call traces differ.',
      'Duplicate-slug resolution policy remains undecided; WALK builds Wiki-neighborhood projections.',
      'Installed dependencies and browser tools reused; clean npm installation and compatibility beyond the pinned upstream revision are unverified.',
      'Trusted isolated Solo receiver is not evidence of deployed Solo compatibility.',
      'CODE trust and Ward temporary LISTEN initiator evidence require separate investigation before production adoption.',
      'Acceptance records are excluded from execution-source digest to avoid circular self-identification; each record is retained separately, append-only.',
    ],
    optionalDiagnostics: [
      {
        path: browser.diagnosticRecord,
        purpose:
          'Full per-run requests, individual checks and browser diagnostics; ignored, not required to read this decision.',
      },
      {
        path: '.artifacts/browser/negative-tests.json',
        purpose: 'Controlled fault oracle details; each child also retains a distinct run record.',
      },
      {
        path: '.artifacts/semantic/',
        purpose: 'Structured baseline/composite state, graph and batch comparison captures.',
      },
    ],
  }
}
export function recordAcceptance(directory, id, options) {
  validateId(id)
  return writeAcceptance(directory, id, collectAcceptance(options))
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = argumentsOf()
  if (!args.id) throw Error('Explicit --id required; prior decisions are never replaced')
  console.log(recordAcceptance(path.join(moduleRoot, 'evidence/acceptance'), args.id, { supersedes: args.supersedes }))
}
