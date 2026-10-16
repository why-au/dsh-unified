import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../lib/panel-client.js', import.meta.url), 'utf8')

// Execute the actual loader factory and component functions, not a duplicate UI.
// Minimal React element/hook and DOM stubs: no browser layout or visual assertions.
function harness() {
  let descriptor, cursor = 0, state = [], copy
  const styles = [], calls = [], registrations = [], disposers = [], disposed = []
  const React = {
    Component: class {}, Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) { return { type, props: { ...props, children: children.flat(Infinity).filter(x => x != null && x !== false) } } },
    useState(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next }]
    },
    useEffect() {}, useCallback(fn) { return fn }, useRef(value) { return { current: value } },
  }
  const context = {
    window: { __ModuleLoader__: { load(value) { descriptor = value } } },
    document: { createElement: () => ({ setAttribute() {} }), head: { appendChild(node) { styles.push(node.textContent) } } },
    console, AbortController,
    fetch: async (url, options) => { calls.push({ url, ...options }); return { ok: true, json: async () => ({ results: [], state: 'done' }) } },
  }
  // Test-only lexical exposure leaves shipped exports/API untouched.
  vm.runInNewContext(source.replace('return module.exports;', 'module.exports.__ui = { HubPanel, ChannelRow, AuthRow, Preferences, HUB_CSS, zh, en }; return module.exports;'), context)
  const plugin = descriptor.factory(name => name === 'react' ? React : name === 'react-dom' ? { createPortal: node => node } : assert.fail(`Unexpected external: ${name}`))
  plugin.apply({
    effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) },
    locale: { register(ns, values) { copy = values }, bind: () => key => key },
    slots: { inject: (name, fn) => { fn(); return () => disposed.push(name) }, register: (meta, component) => registrations.push({ meta, component }) },
  })
  const t = (key, vars = {}) => Object.entries(vars).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), copy.en[key] ?? key)
  return {
    plugin, registrations, styles, calls, t, disposers, disposed,
    mount(Component, props) {
      const local = []
      return () => { state = local; cursor = 0; return Component({ t, ...props }) }
    },
  }
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...(tree.props?.children ?? []).flatMap(nodes)]
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree)
  return (tree?.props?.children ?? []).map(text).join(' ')
}
function find(tree, predicate) { const value = nodes(tree).find(predicate); assert.ok(value, 'Expected rendered element'); return value }
const channel = { id: 'workbuddy1', provider: 'workbuddy', displayName: 'WorkBuddy', state: 'signed-in', account: 'a@example.test', credits: { label: '42', progress: 1.8 }, checkin: { state: 'claimable' }, models: [{ id: 'model-1', name: 'Model One', rate: 'x0.79' }] }
const status = { channels: [channel], summary: { signedIn: 1, total: 1, claimable: 1, done: 0, manual: 0, unsupported: 0 }, preferences: { autoCheckin: true, showDockButton: true } }

test('loader factory retains public contract and both slot contributions', () => {
  const h = harness()
  assert.equal(h.plugin.name, 'dsh-unified-panel-client')
  assert.deepEqual(Array.from(h.plugin.inject), ['slots', 'locale'])
  assert.deepEqual(h.registrations.map(r => r.meta.name), ['sidebar.footer.action', 'settings.plugin.item'])
  assert.deepEqual(Object.keys(h.plugin.__ui.zh).sort(), Object.keys(h.plugin.__ui.en).sort())
  assert.equal(h.disposers.length, 2, 'both slot injections belong to host lifecycle effects')
  h.disposers.forEach(dispose => dispose())
  assert.deepEqual(h.disposed, ['sidebar.footer.action', 'settings.plugin.item'])
})

test('render separates loading, empty and filtered-empty; search is local and reversible', () => {
  const h = harness(), { HubPanel } = h.plugin.__ui
  const props = { layout: 'card', reload() {}, setStatus() {} }
  assert.match(text(h.mount(HubPanel, props)()), /Loading/)
  const empty = h.mount(HubPanel, { ...props, status: { ...status, channels: [] } })
  let tree = empty()
  assert.match(text(tree), /No channels yet/)
  find(tree, n => n.type === 'button' && text(n) === 'Auth').props.onClick()
  assert.equal(nodes(empty()).some(n => n.type?.name === 'AuthSection'), true)
  const render = h.mount(HubPanel, { ...props, status })
  tree = render()
  assert.equal(h.styles.length, 1, 'style injection is shared across layouts/renders')
  find(tree, n => n.type === 'input' && n.props.type === 'search').props.onChange({ target: { value: 'MISSING' } })
  tree = render()
  assert.match(text(tree), /No matching channels/)
  assert.equal(h.calls.length, 0, 'search must never request upstream status')
  find(tree, n => n.type === 'button' && text(n) === 'Clear search').props.onClick()
  assert.equal(nodes(render()).filter(n => n.type?.name === 'ChannelRow').length, 1)
  find(render(), n => n.type === 'input').props.onChange({ target: { value: 'A@EXAMPLE' } })
  assert.equal(nodes(render()).filter(n => n.type?.name === 'ChannelRow').length, 1)
})

test('channel cards expose text status, clamped progress and model controls with original callbacks', async () => {
  const h = harness(), actions = []
  const render = h.mount(h.plugin.__ui.ChannelRow, { row: channel, onCheckin: row => actions.push(row.id), onToggleModel: (...args) => actions.push(args), onToggleAll() {} })
  let tree = render()
  assert.equal(tree.props.className, 'dshc-channel')
  assert.match(text(tree), /signed in/)
  assert.equal(find(tree, n => n.props.role === 'progressbar').props['aria-valuenow'], 100)
  find(tree, n => n.type === 'button' && text(n) === 'Check in').props.onClick()
  assert.equal(actions[0], 'workbuddy1')
  const expand = find(tree, n => n.type === 'button' && n.props['aria-expanded'] === false)
  expand.props.onClick()
  tree = render()
  assert.equal(find(tree, n => n.type === 'button' && n.props['aria-expanded'] === true).props['aria-expanded'], true)
  assert.match(text(tree), /x0.79/)
  await find(tree, n => n.type === 'input' && n.props.type === 'checkbox').props.onChange()
  assert.equal(actions[1][1], 'model-1')
  assert.equal(actions[1][2], true)
})

test('primary action and model writes retain endpoint and payload contracts', async () => {
  const h = harness(), updates = [], props = { status, reload() {}, setStatus: next => updates.push(next) }
  const tree = h.mount(h.plugin.__ui.HubPanel, props)()
  await find(tree, n => n.type === 'button' && text(n).startsWith('Check in all')).props.onClick()
  assert.equal(h.calls[0].url, '/plugins/dsh-unified/checkin')
  assert.equal(h.calls[0].method, 'POST')
  const row = find(tree, n => n.type?.name === 'ChannelRow')
  await row.props.onToggleModel(channel, 'model-1', true)
  assert.equal(h.calls[1].url, '/plugins/dsh-unified/models')
  assert.deepEqual(JSON.parse(h.calls[1].body), { channel: 'workbuddy', model: 'model-1', disabled: true })
  assert.equal(updates.at(-1).channels[0].models[0].disabled, true)
})

test('auth retains two-step delete, restart-gated scan, credential collapse and preference callbacks', () => {
  const h = harness(), actions = []
  const render = h.mount(h.plugin.__ui.AuthRow, { row: { ...channel, state: 'unavailable', configured: true, writable: true }, draft: '', renameDraft: 'WorkBuddy', onRenameToggle() {}, onAction: (...args) => actions.push(args) })
  let tree = render()
  assert.equal(find(tree, n => n.type === 'button' && text(n) === 'Scan').props.disabled, true)
  assert.equal(nodes(tree).some(n => n.type === 'textarea'), false)
  find(tree, n => n.type === 'button' && text(n) === 'Paste').props.onClick()
  tree = render()
  assert.match(find(tree, n => n.type === 'textarea').props['aria-label'], /WorkBuddy/)
  find(tree, n => n.type === 'button' && text(n) === 'Delete').props.onClick()
  assert.equal(actions.length, 0)
  find(render(), n => n.type === 'button' && text(n) === 'Confirm delete').props.onClick()
  assert.equal(actions[0][0], 'delete')
  const prefs = h.mount(h.plugin.__ui.Preferences, { prefs: status.preferences, onPatch: patch => actions.push(patch) })()
  find(prefs, n => n.type === 'input').props.onChange({ target: { checked: false } })
  assert.equal(actions[1].autoCheckin, false)
})

test('disabled/busy check-in remains unavailable; theme, narrow-screen and reduced-motion contracts', () => {
  const h = harness()
  const tree = h.mount(h.plugin.__ui.ChannelRow, { row: channel, busy: true })()
  assert.equal(find(tree, n => n.type === 'button' && text(n) === 'Checking…').props.disabled, true)
  const css = h.plugin.__ui.HUB_CSS
  assert.match(css, /:focus-visible/)
  assert.match(css, /@media\(max-width:420px\)/)
  assert.match(css, /prefers-reduced-motion:reduce/)
  assert.match(css, /--dsw-alias-interactive-bg-hover/)
  assert.doesNotMatch(source, /#2ea043|#d29922|#8b949e/)
})
