// Fixed inventory: missing execution is a failure, never vacuous acceptance.
export const codeChecks = [
  'CODE named export through actual CLICK emission',
  'CODE named export through actual TICK',
  ...['unowned direct', 'owned local', 'owned remote', 'truthy internal initiator'].map(x => 'CODE guard: ' + x),
  ...['missing export', 'trusted throw', 'syntax failure'].map(x => 'CODE diagnostic: ' + x),
]
const bundle = 'Bundle loaded with expected plugin entry'
const solo = 'SOLO batch delivery and real status/reset lifecycle'
export const criterionTests = {
  T1: [bundle],
  T2: ['Exactly one catalog and preserved upstream emitters', bundle],
  T3: ['Extensions installed before first plugin emission', 'Duplicate, collision and incompatible catalog rejection'],
  T4: [
    'EXTRACT EDGES DEBUG dispatch with real DOM',
    'EDGES destinations are safe in detached DOM',
    ...['question', 'claim', 'support', 'oppose'].map(x => 'Role WALK ' + x),
    'Extension error diagnostics',
  ],
  T5: ['Ordinary WALK and HELLO match upstream control'],
  T6: codeChecks,
  T7: [solo, 'SOLO missing-aspect diagnostic'],
  T8: [solo],
}
export const requiredChecks = {
  upstream: [bundle, 'Unmodified upstream rejects extension command', ...codeChecks],
  composite: [...new Set(Object.values(criterionTests).flat())],
  baseline: [bundle, 'SOLO batch delivery'],
}
export function evaluateAcceptance(report) {
  const passed = (configuration, name) => {
    const matches = report.tests.filter(t => t.configuration === configuration && t.name === name)
    return matches.length === 1 && matches[0].status === 'PASS'
  }
  const missingOrFailed = Object.entries(requiredChecks).flatMap(([configuration, names]) =>
    names.filter(name => !passed(configuration, name)).map(name => ({ configuration, name })),
  )
  const acceptance = Object.fromEntries(
    Object.entries(criterionTests).map(([id, names]) => [
      id,
      {
        status: names.every(name => passed('composite', name)) ? 'PASS' : 'FAIL',
        supportingTests: names,
      },
    ]),
  )
  const ownedContextsClosed =
    report.cleanup.length > 0 && report.cleanup.every(c => c.closeObserved && c.closed && c.attempts.length > 0)
  const cleanupSatisfied =
    ownedContextsClosed &&
    report.cleanup.length === 3 &&
    ['upstream', 'composite', 'baseline'].every(name => report.cleanup.some(c => c.configuration === name)) &&
    report.cleanup.every(c => c.attempts.every(a => a.status === 'PASS'))
  acceptance.T9 = {
    status:
      report.sourceIntegrity === true &&
      report.unexpectedRequests.length === 0 &&
      ['upstream', 'composite', 'baseline'].every(name => {
        const c = report.configurations[name]
        return c && c.pageErrors.length === 0 && c.consoleErrors.length === 0
      }) &&
      cleanupSatisfied
        ? 'PASS'
        : 'FAIL',
  }
  const status =
    Object.values(acceptance).every(c => c.status === 'PASS') &&
    missingOrFailed.length === 0 &&
    report.tests.every(t => t.status === 'PASS')
      ? 'PASS'
      : 'FAIL'
  return {
    acceptance,
    aggregateAcceptance: status,
    missingOrFailed,
    ownedContextsClosed,
    cleanupSatisfied,
    exitCode: status === 'PASS' ? 0 : 1,
  }
}

// Register ownership immediately after launch, before initialization can throw.
export function contextOwner(report) {
  const owned = new Map()
  return {
    register(context, configuration) {
      const record = { configuration, closed: false, closeObserved: false, attempts: [] }
      context.on('close', () => {
        record.closeObserved = true
      })
      owned.set(context, record)
      report.cleanup.push(record)
    },
    async close(context, injectFailure = false) {
      const record = owned.get(context)
      if (!record) throw Error('Refusing to close an unowned context')
      if (record.closed) return
      try {
        if (injectFailure) throw Error('Controlled cleanup-operation failure')
        await context.close()
        record.closed = record.closeObserved
        if (!record.closed) throw Error('Context close operation returned without a close event')
        record.attempts.push({ status: 'PASS' })
      } catch (e) {
        record.attempts.push({ status: 'FAIL', message: e.message })
      }
    },
    async closeRemaining() {
      for (const [context, record] of owned) if (!record.closed) await this.close(context)
    },
  }
}
