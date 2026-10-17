import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { numberOrNull, asUsageSnapshot, deepestUsedPercent, grokBillingPercent, usageWindows } from '../lib/usage.js'

// AccountStore reads quarantine state on import; isolate it from the real home.
const home = await mkdtemp(join(tmpdir(), 'dsh-usage-unknown-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = home
const { createAccountStore } = await import('../lib/accounts.js')
const { registerCustomVendor, clearCustomVendors } = await import('../lib/vendors/index.js')
const { registerCustomProviderIds } = await import('../lib/refs.js')
after(async () => {
  clearCustomVendors()
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

const unknown = [null, undefined, '', '   ', true, false, 'unknown', NaN, Infinity, -Infinity, [], {}, [0], Symbol('unknown'), 0n]
const known = [[0, 0], ['0', 0], [' 0 ', 0], [12.5, 12.5], ['12.5', 12.5], [' 25 ', 25], ['1e2', 100]]

test('usage conversion preserves unknown rather than coercing it to zero', () => {
  for (const value of unknown) {
    assert.equal(numberOrNull(value), null, String(value))
    assert.equal(asUsageSnapshot(value), null, String(value))
  }
  assert.equal(deepestUsedPercent({ utilization: null, remainingFraction: null, usedFraction: null }), null)
  assert.equal(grokBillingPercent(null), null)
  assert.equal(grokBillingPercent({ config: { creditUsagePercent: null, monthlyLimit: 100, used: null } }), null)
  assert.equal(usageWindows({ primary: { utilization: null, remainingFraction: null, usedFraction: null } }), null)
})

test('usage conversion accepts actual zero and upstream numeric strings', () => {
  for (const [value, expected] of known) {
    assert.equal(numberOrNull(value), expected)
    assert.deepEqual(asUsageSnapshot(value), { usedPercent: expected })
  }
  assert.equal(deepestUsedPercent({ primary: { utilization: '0' } }), 0)
  assert.equal(grokBillingPercent({ config: { creditUsagePercent: '0' } }), 0)
  assert.equal(usageWindows({ primary: { utilization: '0' } })[0].usedPercent, 0)
})

test('usage windows retain all model buckets, zero usage and scope flags', () => {
  const windows = usageWindows({
    primary: { utilization: 20 },
    models: [
      { modelId: 'model-zero', usedPercent: 0 },
      { modelId: 'model-one', usedPercent: '10' },
      { model: 'model-two', usedPercent: 80 },
      { modelId: 'model-three', usedPercent: 100 },
      { modelId: 'model-unknown', usedPercent: null },
    ],
  })
  assert.deepEqual(windows.map(({ id, usedPercent, isModelBucket }) => ({ id, usedPercent, isModelBucket })), [
    { id: 'primary', usedPercent: 20, isModelBucket: false },
    { id: 'model-zero', usedPercent: 0, isModelBucket: true },
    { id: 'model-one', usedPercent: 10, isModelBucket: true },
    { id: 'model-two', usedPercent: 80, isModelBucket: true },
    { id: 'model-three', usedPercent: 100, isModelBucket: true },
  ])
})

function harness(snapshot) {
  const provider = 'usage_test'
  let usageCalls = 0
  const notices = []
  registerCustomProviderIds([provider])
  registerCustomVendor({ id: provider, defaults: () => ({}), usage: async () => { usageCalls++; return snapshot } })
  let raw = JSON.stringify({ accessToken: 'offline-test-token' })
  const credentials = {
    resolve: async () => ({ value: raw }),
    describe: async () => ({ configured: true }),
    set: async (_ref, value) => { raw = value },
  }
  const store = createAccountStore({
    credentials,
    getConfig: () => ({ slots: [{ provider, index: 1 }] }),
    fetchImpl: async () => { throw new Error('unexpected network request') },
    onLimitNotice: (...args) => notices.push(args),
  })
  return { provider, store, notices, usageCalls: () => usageCalls }
}

test('account refresh leaves unknown usage null and preserves zero/numeric strings', async () => {
  for (const value of [...unknown, ...known.map(([input]) => input)]) {
    const h = harness({ usedPercent: value })
    await h.store.refreshUsage(h.provider)
    assert.equal(h.usageCalls(), 1, 'exercise the real vendor refresh path')
    const [account] = await h.store.listAccounts(h.provider)
    assert.equal(account.usagePercent, numberOrNull(value), String(value))
  }
})

test('account refresh ignores unknown window percentages and accepts numeric notification thresholds', async () => {
  const windows = [
    ...unknown.map((usedPercent, i) => ({ id: `unknown-${i}`, usedPercent })),
    { id: 'zero', usedPercent: 0 },
    { id: 'string-zero', usedPercent: '0' },
    { id: 'numeric', usedPercent: 70 },
    { id: 'numeric-string', usedPercent: '90' },
  ]
  const h = harness({ usedPercent: null, windows })
  await h.store.refreshUsage(h.provider)
  assert.equal(h.usageCalls(), 1)
  assert.equal((await h.store.listAccounts(h.provider))[0].usagePercent, null)
  assert.deepEqual(h.notices.map(([, , win, threshold]) => [win.id, threshold]), [['numeric', 70], ['numeric-string', 70]])
})
