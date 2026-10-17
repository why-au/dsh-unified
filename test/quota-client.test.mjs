import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../lib/quota-client.js', import.meta.url), 'utf8')
function load(extra = {}) {
  let entry
  const React = {
    Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    ...extra.React,
  }
  const context = {
    window: { __ModuleLoader__: { load: (r) => { entry = r } } },
    Date, console, ...extra,
  }
  vm.runInNewContext(source, context)
  const exports = entry.factory((id) => id === 'react' ? React : { createPortal: (child, target) => ({ portal: child, target }) })
  return { exports, React }
}
const { quotaHelpers: q } = load().exports
const now = Date.UTC(2026, 0, 1)

test('reset countdown and used share match the screenshot, without reversing percentages', () => {
  const account = { provider: 'codex', windows: [
    { id: '5h', usedPercent: 0, resetAt: now + (4 * 60 + 59) * 60000 },
    { id: '7d', usedPercent: 78, resetAt: now + (5 * 24 + 12) * 3600000 },
  ] }
  assert.equal(q.accountText(account, null, now, 'unknown'), '4h 59m 0% · 5d 12h 78%')
  assert.equal(q.countdown(now - 1, now), '↻')
  assert.equal(q.countdown(null, now), '')
  assert.equal(q.countdown(now + 59000, now), '1m')
})

test('unknown quota stays unknown, genuine zero and numeric bounds remain valid', () => {
  for (const value of [null, undefined, '', false, NaN, Infinity, '0']) {
    assert.equal(q.accountText({ usagePercent: value }, null, now, 'unknown'), 'unknown')
  }
  assert.equal(q.accountText({ usagePercent: 0 }, null, now, 'unknown'), '0%')
  assert.equal(q.accountText({ usagePercent: 125 }, null, now, 'unknown'), '100%')
})

test('current-session selection is isolated, all mode includes other subscriptions', () => {
  const rows = [{ provider: 'codex' }, { provider: 'claude' }, { provider: 'codex' }]
  assert.equal(q.selectAccounts(rows, { provider: 'codex' }, 'windows').length, 2)
  assert.equal(q.selectAccounts(rows, { provider: 'workbuddy1' }, 'windows').length, 0)
  assert.equal(q.selectAccounts(rows, null, 'windows').length, 0)
  assert.equal(q.selectAccounts(rows, null, 'all').length, 3)
})

test('model-level quotas never leak percentages from another model', () => {
  const a = { usagePercent: 90, windows: [
    { id: 'model-a', isModelBucket: true, usedPercent: 90 },
    { id: 'model-b', isModelBucket: true, usedPercent: 0 },
  ] }
  assert.equal(q.accountText(a, 'model-a', now, 'unknown'), 'model-a 90%')
  assert.equal(q.accountText(a, 'model-b', now, 'unknown'), 'model-b 0%')
  assert.equal(q.accountText(a, 'model-c', now, 'unknown'), 'unknown')
  assert.equal(q.accountText(a, null, now, 'unknown'), 'unknown')
})

test('dock registration reads the selected model from the owning session and disposes', async () => {
  const { exports } = load()
  let registration, off, selectedSession, removed = false
  const ctx = {
    effect(fn) { off = fn() },
    get(name) { assert.equal(name, 'modelDirectories'); return { directoryFor(id) {
      selectedSession = id
      return { load: async () => ({ current: { provider: 'claude', model: 'sonnet' } }) }
    } } },
    slots: {
      inject(seat, fn) { assert.equal(seat, 'conversation.composer.dock'); return fn() },
      register(row) { registration = row; return () => { removed = true } },
    },
  }
  exports.apply(ctx)
  assert.equal(registration.id, 'dsh-unified-subscription-usage')
  const current = await registration.inject('session-b').readSelection()
  assert.equal(selectedSession, 'session-b')
  assert.equal(current.provider, 'claude')
  ctx.get = () => undefined
  assert.equal(await registration.inject('session-c').readSelection(), null)
  off()
  assert.equal(removed, true)
})

test('component portals into stats row, renders all providers, and releases polling and observer', async () => {
  let component, stateIndex = 0, refIndex = 0, observerOff = false
  const states = [], refs = [], effects = [], timers = new Set()
  const target = { isConnected: true }
  const scope = { querySelector: () => target, parentElement: null }
  const data = { composerQuota: 'all', subscriptions: [
    { provider: 'codex', name: 'Codex', index: 1, windows: [{ id: '5h', usedPercent: 0, resetAt: now + 60000 }] },
    { provider: 'claude', name: 'Claude', index: 1, usagePercent: 78 },
    { provider: 'copilot', name: 'Copilot', index: 1, usagePercent: null },
  ] }
  const { exports } = load({
    fetch: async () => ({ ok: true, json: async () => data }),
    AbortController,
    navigator: { language: 'en' },
    setTimeout: (fn) => { const id = {}; timers.add(id); return id },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { const id = {}; timers.add(id); return id },
    clearInterval: (id) => timers.delete(id),
    MutationObserver: class { observe() {} disconnect() { observerOff = true } },
    React: {
      useState(initial) {
        const i = stateIndex++
        if (!(i in states)) states[i] = initial
        return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v }]
      },
      useRef(initial) { const i = refIndex++; return refs[i] || (refs[i] = { current: i === 0 ? { parentElement: scope } : initial }) },
      useEffect(fn) { effects.push(fn) },
    },
  })
  exports.apply({ effect: (fn) => fn(), slots: { inject: (_, fn) => fn(), register: (_, c) => { component = c; return () => {} } } })
  component({ readSelection: async () => ({ provider: 'codex', model: 'gpt' }) })
  const cleanup = effects.map((fn) => fn()).filter(Boolean)
  await new Promise((resolve) => setImmediate(resolve))
  stateIndex = 0; refIndex = 0
  const result = component({ readSelection: async () => null })
  const portal = result.children.find((c) => c && c.portal)
  assert.equal(portal.target, target)
  const button = portal.portal.children[0]
  assert.match(button.children[0], /Codex .*0%.*Claude 78%.*Copilot Quota unknown/)
  assert.match(button.props.title, /Used quota/)
  assert.equal(button.props['aria-expanded'], false)
  for (const off of cleanup) off()
  assert.equal(timers.size, 0)
  assert.equal(observerOff, true)
})
