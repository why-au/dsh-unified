import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Set this before importing AccountStore: its quarantine cache loads at module
// initialization. Never resolve the user's credentials or touch their DSH home.
const home = await mkdtemp(join(tmpdir(), 'dsh-anonymous-test-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = home
const originalFetch = globalThis.fetch
globalThis.fetch = async () => { throw new Error('unexpected network request') }
after(async () => {
  globalThis.fetch = originalFetch
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

const { createAccountStore, vendorConfig, normalizeSlots, proxyUrlForRef } = await import('../lib/accounts.js')
const { createAdapterManager } = await import('../lib/adapter-manager.js')
const { Config, plainConfig } = await import('../lib/config-schema.js')
const { anonymousRef, isProvider, displayName } = await import('../lib/refs.js')
const { getVendor, registerCustomVendor, clearCustomVendors } = await import('../lib/vendors/index.js')
const { registerCustomProviderIds } = await import('../lib/refs.js')

function sse(chunks) {
  return new Response([...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), 'data: [DONE]\n\n'].join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}
function textResponse(text = 'Hello from anonymous Zen') {
  return sse([
    { choices: [{ delta: { content: text } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 } },
  ])
}
async function collect(stream) {
  const out = []
  for await (const event of stream) out.push(event)
  return out
}
function harness({ slots = [], fetchImpl = async () => textResponse(), config = {} } = {}) {
  const credentialCalls = []
  const credentials = Object.fromEntries(['resolve', 'describe', 'set', 'unset'].map((method) => [method, async (...args) => {
    credentialCalls.push([method, ...args])
    throw new Error(`credential access forbidden: ${method}`)
  }]))
  const cfg = plainConfig(Config({ slots, autoPacing: false, enableSoftFailureSentinel: false, ...config }))
  const store = createAccountStore({ credentials, getConfig: () => cfg, fetchImpl })
  const registry = new Map()
  const registrations = []
  const history = []
  const ctx = {
    credentials,
    llm: {
      listProviders: () => [...registry.keys()].map((id) => ({ id })),
      registerAdapter: (providers, adapter) => {
        registrations.push([...providers])
        for (const provider of providers) registry.set(provider, adapter)
        return {
          dispose: () => { for (const provider of providers) registry.delete(provider) },
          replace: (next) => {
            for (const [provider, current] of registry) if (current === adapter) registry.delete(provider)
            for (const provider of next) registry.set(provider, adapter)
          },
        }
      },
    },
  }
  const manager = createAdapterManager({
    ctx, live: () => cfg, store, fetch: fetchImpl, fetchForRef: () => null,
    recordHistory: (entry) => history.push(entry),
    getSettingsApi: () => null, syncCustomVendors: () => {}, stripLegacySlots: (value) => value,
  })
  return { store, manager, registry, registrations, history, credentialCalls, cfg }
}
const options = (extra = {}) => ({
  provider: 'zen', model: 'big-pickle', sessionId: 'anonymous-integration',
  messages: [{ role: 'user', content: 'hello' }], ...extra,
})

test('real AccountStore registers Zen without slots, token, or credential calls; models and text/usage stream work', async (t) => {
  const requests = []
  const h = harness({ config: { zenBaseUrl: 'https://offline.invalid/zen/v1' }, fetchImpl: async (url, init) => {
    requests.push({ url, init })
    return textResponse()
  } })
  t.after(() => h.manager.dispose())
  assert.equal(getVendor('zen').anonymous, true)
  assert.equal(isProvider('zen'), true)
  assert.equal(displayName('zen'), 'OpenCode Zen (Free)')
  assert.equal(normalizeSlots([{ provider: 'zen', index: 1 }]).length, 1)
  assert.deepEqual(await h.store.loggedInProviders(), ['zen'])
  const accounts = await h.store.listAccounts('zen')
  assert.equal(accounts.length, 1)
  assert.equal(accounts[0].ref, anonymousRef('zen'))
  assert.equal(accounts[0].anonymous, true)
  assert.equal(accounts[0].hasToken, true) // legacy rotation eligibility flag
  await h.manager.syncAdapter()
  assert.deepEqual(h.registrations, [['zen']])
  const adapter = h.registry.get('zen')
  assert.ok(adapter, 'use the actual instance registered with the host')
  const models = await adapter.listModels('zen')
  assert.ok(models.some((row) => row.id === 'big-pickle' && row.provider === 'zen'))
  assert.equal((await adapter.resolveModel('zen', 'big-pickle')).provider, 'zen')
  await h.manager.refreshModels()
  const prepared = await adapter.prepareCall('zen', 'big-pickle')
  const events = await collect(prepared.stream(options()))
  assert.ok(events.some((event) => event.type === 'text-delta' && event.text.includes('anonymous Zen')))
  assert.ok(events.some((event) => event.type === 'usage' && event.usage.inputTokens === 12 && event.usage.outputTokens === 6))
  assert.ok(events.some((event) => event.type === 'finish' && event.reason.kind === 'stop'))
  assert.equal(h.store.getRequestCount(anonymousRef('zen')), 1)
  assert.equal(h.history.at(-1).outcome, 'success')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://offline.invalid/zen/v1/chat/completions')
  const body = JSON.parse(requests[0].init.body)
  assert.equal(body.stream, true)
  assert.equal(body.tool_choice, 'none')
  assert.deepEqual(body.tools.map((tool) => tool.function.name), ['bash', 'read'])
  assert.equal(requests[0].init.headers.Authorization, 'Bearer public')
  assert.match(requests[0].init.headers['x-opencode-session'], /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
  assert.deepEqual(h.credentialCalls, [])
})

test('real manager tool stream preserves host schemas, streamed call arguments, and tool-result continuation', async (t) => {
  const requests = []
  const h = harness({ fetchImpl: async (url, init) => {
    requests.push(JSON.parse(init.body))
    if (requests.length > 1) return textResponse('Tool result received')
    return sse([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_read', type: 'function', function: { name: 'read', arguments: '{"path":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"demo.txt"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ])
  } })
  t.after(() => h.manager.dispose())
  await h.manager.syncAdapter()
  const adapter = h.registry.get('zen')
  const tools = [{ name: 'read', description: 'Read a real file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }]
  const events = await collect(adapter.stream(options({ tools })))
  const realRead = requests[0].tools.filter((tool) => tool.function.name === 'read')
  assert.equal(realRead.length, 1)
  assert.deepEqual(realRead[0].function, tools[0])
  assert.equal(requests[0].tool_choice, undefined)
  const toolStart = events.find((event) => event.type === 'block-start' && event.blockType === 'tool-call')
  assert.ok(toolStart, JSON.stringify(events))
  const deltas = events.filter((event) => event.type === 'tool-call-delta')
  assert.equal(deltas[0].name, 'read')
  assert.equal(deltas[0].id, 'call_read')
  assert.equal(deltas.map((event) => event.argumentsDelta).join(''), '{"path":"demo.txt"}')
  assert.ok(events.some((event) => event.type === 'finish' && event.reason.kind === 'tool-calls'))
  const continuation = await collect(adapter.stream(options({ tools, messages: [
    { role: 'user', content: 'read the file' },
    { role: 'assistant', content: [{ type: 'tool-call', id: 'call_read', name: 'read', arguments: '{"path":"demo.txt"}' }] },
    { role: 'tool', toolCallId: 'call_read', content: 'file contents' },
  ] })))
  assert.deepEqual(requests[1].messages[1].tool_calls, [{
    id: 'call_read', type: 'function', function: { name: 'read', arguments: '{"path":"demo.txt"}' },
  }])
  assert.equal(requests[1].messages.at(-1).tool_call_id, 'call_read')
  assert.equal(requests[1].messages.at(-1).content, 'file contents')
  assert.ok(continuation.some((event) => event.type === 'text-delta'))
  assert.deepEqual(h.credentialCalls, [])
})

test('429 cools the single virtual identity across calls and slots without vault writes; expiry recovers', async (t) => {
  let calls = 0
  const h = harness({ slots: [{ provider: 'zen', index: 1 }, { provider: 'zen', index: 2 }], fetchImpl: async () => {
    calls++
    return calls === 1 ? new Response('rate limited', { status: 429 }) : textResponse('Recovered')
  } })
  t.after(() => h.manager.dispose())
  await h.manager.syncAdapter()
  const adapter = h.registry.get('zen')
  const first = await collect(adapter.stream(options({ sessionId: 'anonymous-cooldown' })))
  assert.ok(first.some((event) => event.type === 'finish' && event.reason.kind === 'error'))
  const ref = anonymousRef('zen')
  const [account] = await h.store.listAccounts('zen')
  assert.equal((await h.store.listAccounts('zen')).length, 1)
  assert.ok(account.cooldownUntil > Date.now())
  assert.ok(account.quarantineUntil > Date.now())
  assert.ok(JSON.parse(await readFile(join(home, 'subscriptions', 'quarantines.json'), 'utf8'))[ref])
  await collect(adapter.stream(options({ sessionId: 'anonymous-cooldown-second' })))
  assert.equal(calls, 1, 'a new request/slot must not bypass the anonymous cooldown')
  h.store.rememberQuarantine(ref, 'RATE_LIMIT', Date.now() - 1)
  h.store.rememberCooldown(ref, Date.now() - 1)
  const recovered = await collect(adapter.stream(options({ sessionId: 'anonymous-cooldown-recovered' })))
  assert.equal(calls, 2)
  assert.ok(recovered.some((event) => event.type === 'text-delta' && event.text === 'Recovered'))
  assert.equal((await h.store.describeRef(ref)).cooldownUntil, 0)
  await h.store.saveBlob(ref, { accessToken: 'must-not-persist' })
  await h.store.saveBlob('ZEN_OAUTH_1', { accessToken: 'legacy-must-not-persist' })
  assert.deepEqual(await h.store.loadBlob(ref), { anonymous: true })
  assert.deepEqual(await h.store.ensureFresh('zen', { refreshToken: 'must-not-refresh' }, ref), { anonymous: true })
  await h.store.refreshUsage('zen')
  await h.store.clearRef(ref)
  assert.deepEqual(h.credentialCalls, [])
})

test('anonymous proxy resolution uses the first configured proxy without splitting identity', async (t) => {
  const slots = [
    { provider: 'zen', index: 1 },
    { provider: 'zen', index: 2, proxyUrl: 'http://first.invalid:8080' },
    { provider: 'zen', index: 3, proxyUrl: 'http://second.invalid:8080' },
    { provider: 'codex', index: 1, proxyUrl: 'http://codex.invalid:8080' },
  ]
  const h = harness({ slots })
  t.after(() => h.manager.dispose())
  const accounts = await h.store.listAccounts('zen')
  assert.equal(accounts.length, 1)
  assert.equal(proxyUrlForRef(accounts[0].ref, slots), 'http://first.invalid:8080')
  assert.equal(proxyUrlForRef('CODEX_OAUTH_1', slots), 'http://codex.invalid:8080')
  assert.equal(proxyUrlForRef('ZEN_ANONYMOUS', []), '')
  assert.deepEqual(h.credentialCalls, [])
})

test('removed custom vendor IDs do not break logged-in providers or adapter sync', async (t) => {
  const id = 'removed_vendor_regression'
  registerCustomProviderIds([id])
  registerCustomVendor({ id, defaults: () => ({}) })
  clearCustomVendors() // Same lifecycle as removing a profile in syncCustomVendors.
  const h = harness({ slots: [{ provider: id, index: 1 }] })
  t.after(() => h.manager.dispose())
  assert.deepEqual(await h.store.loggedInProviders(), ['zen'])
  await h.manager.syncAdapter()
  assert.ok(h.registry.has('zen'))
  await h.store.clearRef('REMOVED_VENDOR_REGRESSION_OAUTH_1')
  assert.equal(h.credentialCalls.some(([method]) => method === 'resolve' || method === 'describe'), false)
})

test('vendorConfig normalizes apiBase/baseUrl defaults and overrides in both directions', () => {
  const zenDefault = getVendor('zen').defaults().apiBase
  assert.equal(vendorConfig('zen', {}).baseUrl, zenDefault)
  for (const config of [{ zenBaseUrl: 'https://legacy.invalid/v1' }, { zenApiBase: 'https://new.invalid/v1' }]) {
    const result = vendorConfig('zen', config)
    assert.equal(result.baseUrl, result.apiBase)
    assert.match(result.apiBase, /^https:\/\//)
  }
  assert.equal(vendorConfig('zen', { zenBaseUrl: 'https://legacy.invalid', zenApiBase: 'https://new.invalid' }).baseUrl, 'https://new.invalid')
  registerCustomProviderIds(['baseurl_regression'])
  registerCustomVendor({ id: 'baseurl_regression', defaults: () => ({ baseUrl: 'https://base-default.invalid' }) })
  assert.equal(vendorConfig('baseurl_regression', {}).apiBase, 'https://base-default.invalid')
  assert.equal(vendorConfig('baseurl_regression', { baseurl_regressionBaseUrl: 'https://base-override.invalid' }).apiBase, 'https://base-override.invalid')
})
