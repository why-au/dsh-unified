import test from 'node:test'
import assert from 'node:assert/strict'
import { buildQuotaAccount } from '../lib/quota-status.js'

const account = (info, extra = {}) => buildQuotaAccount({ provider: 'codex', name: 'Codex', index: 2, label: 'masked', info, ...extra })

test('unknown usage stays null, including providers without any quota data', () => {
  for (const info of [undefined, null, {}, { configured: true, usagePercent: null, usage: null }]) {
    const result = account(info)
    assert.equal(result.usagePercent, null)
    assert.deepEqual(result.windows, [])
  }
  assert.equal(account({}).status, 'unknown')
  assert.equal(account({ configured: true }).status, 'ok')
})

test('zero is real data and account identity does not depend on provider aggregates', () => {
  const result = account({ configured: true, usagePercent: 0, usageAt: 0 })
  assert.deepEqual(result, { provider: 'codex', name: 'Codex', index: 2, label: 'masked', windows: [], usagePercent: 0, status: 'ok', usageAt: 0 })
  assert.equal(account({ usagePercent: 87 }).usagePercent, 87)
  assert.equal(account({ usagePercent: null }).usagePercent, null)
})

test('all valid windows retain reset times, localized labels and model-bucket flags', () => {
  const usage = [
    { id: 'five_hour', en: '5h', zh: '5小时', usedPercent: 0, resetAt: 1700000000000, isModelBucket: false },
    { id: 'seven_day', ru: '7 дней', usedPercent: 42, resetAt: 1800000000000 },
    { id: 'model', usedPercent: 99, resetAt: 0, isModelBucket: true },
  ]
  const result = account({ configured: true, usage, usageAt: 123 })
  assert.equal(result.windows.length, 3)
  assert.deepEqual(result.windows.map((w) => w.resetAt), [1700000000000, 1800000000000, 0])
  assert.equal(result.windows[0].isModelBucket, false)
  assert.equal(result.windows[2].isModelBucket, true)
  assert.equal(result.windows[0].zh, '5小时')
  assert.equal(result.windows[1].label, '7 дней')
  assert.equal(result.usagePercent, 99)
  assert.equal(result.usageAt, 123)
  assert.equal(account({ usage, usagePercent: 0 }).usagePercent, 0)
})

test('finite numbers are strict: null, strings, booleans and nonfinite numbers never become zero', () => {
  for (const value of [null, undefined, '', '0', '73', false, true, NaN, Infinity, -Infinity, {}, []]) {
    const result = account({ usagePercent: value, usageAt: value, usage: [null, { usedPercent: value }] })
    assert.equal(result.usagePercent, null)
    assert.deepEqual(result.windows, [])
    assert.equal(Object.hasOwn(result, 'usageAt'), false)
    const window = account({ usage: [{ id: 'x', usedPercent: 0, resetAt: value }] }).windows[0]
    assert.equal(window.resetAt, null)
  }
})

test('public projection drops secrets/raw blobs and never falls back to unmasked identity', () => {
  const secret = { secret: 'SECRET', accessToken: 'SECRET', raw: { token: 'SECRET' } }
  const info = { ...secret, configured: true, label: 'private@example.test', email: 'private@example.test', validationUrl: 'https://secret.test', usage: [{ ...secret, id: 'x', usedPercent: 5, resetAt: 123, isModelBucket: { secret: 'SECRET' }, en: { secret: 'SECRET' } }], status: { secret: 'SECRET' } }
  const result = account(info)
  assert.deepEqual(Object.keys(result).sort(), ['provider', 'name', 'index', 'label', 'windows', 'usagePercent', 'status'].sort())
  assert.deepEqual(result.windows, [{ id: 'x', label: 'x', usedPercent: 5, resetAt: 123 }])
  assert.equal(result.status, 'verify')
  assert.doesNotMatch(JSON.stringify(result), /SECRET|private@|secret\.test/)
  assert.equal(buildQuotaAccount({ info }).label, '')
})

test('status route preserves legacy aggregates, per-slot usage, privacy and active window metadata without new requests', async () => {
  const { registerStatusRoutes } = await import('../lib/routes/status.js')
  const { oauthRef } = await import('../lib/refs.js')
  const routes = new Map()
  const refs = [1, 2, 3, 4].map((index) => oauthRef('codex', index))
  const calls = []
  const infos = [
    { configured: true, label: 'private-one', usagePercent: 91, usage: [{ id: '5h', en: '5h', usedPercent: 91, resetAt: 123, isModelBucket: false }], accessToken: 'SECRET' },
    { configured: true, label: 'private-two', usagePercent: 0, usageAt: 456, cooldownUntil: Date.now() + 60000 },
    { configured: true, label: 'private-three', usagePercent: null },
    { configured: false, usagePercent: null },
  ]
  const config = { slots: refs.map((ref, i) => ({ provider: 'codex', index: i + 1 })) }
  const store = {
    loggedInProviders: async () => ['codex'],
    describeRef: async (ref) => { calls.push(ref); return infos[refs.indexOf(ref)] },
    listAccounts: async () => [{ ref: refs[0] }],
  }
  registerStatusRoutes({ effect: (fn) => fn(), webServer: { register: (route) => routes.set(route.path, route.handler) } }, {
    live: () => config, store, history: { recent: () => [{ provider: 'codex', ref: refs[0], ts: 100, model: 'model' }] }, pmL: () => 'masked',
    fetchForRef: () => { throw new Error('must not fetch') },
  })
  let code, body
  await routes.get('/dsh-subscriptions/status')({ method: 'GET', headers: { host: 'localhost' } }, {
    writeHead: (value) => { code = value }, end: (value) => { body = JSON.parse(value) },
  })
  assert.equal(code, 200)
  assert.equal(body.ok, true)
  assert.equal(body.loggedIn.codex, true)
  assert.equal(body.usagePercent.codex, 91)
  assert.deepEqual(body.subscriptions.map((a) => a.index), [1, 2, 3])
  assert.deepEqual(body.subscriptions.map((a) => a.usagePercent), [91, 0, null])
  assert.deepEqual(body.subscriptions.map((a) => a.label), ['masked', 'masked', 'masked'])
  assert.equal(body.subscriptions[1].status, 'cooldown')
  assert.equal(body.subscriptions[1].usageAt, 456)
  assert.equal(body.active.windows[0].resetAt, 123)
  assert.equal(body.active.windows[0].isModelBucket, false)
  assert.equal(body.active.usagePercent, 91)
  assert.doesNotMatch(JSON.stringify(body), /SECRET|private-/)
  assert.deepEqual(calls, [...refs, refs[0]])
})
