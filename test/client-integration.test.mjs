import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const pkg = JSON.parse(read('package.json'))
const source = read(pkg.exports['./client'])

function loadClient({ primitives = true } = {}) {
  let registration
  const styles = []
  const document = {
    querySelector: () => styles[0] || null,
    createElement: () => ({ dataset: {}, setAttribute() {} }),
    head: { appendChild: (tag) => styles.push(tag) },
  }
  const window = { __ModuleLoader__: { load: (entry) => { registration = entry } } }
  vm.runInNewContext(source, { window, document, console }, { filename: 'client.js' })
  assert.equal(styles.length, 0, 'script execution must only register the factory')
  const required = []
  const exports = registration.factory((id) => {
    required.push(id)
    if (id === 'react') return { Component: class {}, createElement() {} }
    if (id === '@deepseek-ai/dsh-client-ui-primitives' && primitives) return {}
    throw new Error(`Unavailable external: ${id}`)
  })
  return { registration, exports, styles, required }
}

test('manifest declares the host-discovered web client and its externals', () => {
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.deepEqual(pkg.dsh.client.inject, ['slots', 'locale', 'sessions'])
  assert.equal(pkg.exports['./client'], './lib/client.js')
  const loaded = loadClient()
  assert.equal(loaded.registration.id, pkg.name)
  assert.deepEqual(Array.from(loaded.exports.inject), pkg.dsh.client.inject)
  for (const id of loaded.required) assert.ok(pkg.dsh.client.external.includes(id), id)
  assert.equal(typeof loaded.exports.apply, 'function')
  assert.equal(loaded.styles.length, 1)
})

test('optional primitives missing does not break factory materialization', () => {
  assert.equal(typeof loadClient({ primitives: false }).exports.apply, 'function')
})

test('client registers unified bundle/row seats and disposes all UI seats', () => {
  const { exports } = loadClient()
  const rows = []
  const effects = []
  const active = new Set()
  const locales = new Set()
  const ctx = {
    effect(fn) { const off = fn(); if (typeof off === 'function') effects.push(off) },
    inject() {},
    get() { return undefined },
    locale: {
      bind: () => (key) => key,
      register(ns, language) {
        const id = `${ns}:${language}`
        locales.add(id)
        return () => locales.delete(id)
      },
    },
    slots: {
      inject(_seat, fn) { return fn() },
      register(row, component) {
        assert.equal(typeof component, 'function')
        rows.push(row)
        active.add(row)
        return () => active.delete(row)
      },
    },
  }
  exports.apply(ctx)
  assert.ok(rows.some((r) => r.name === 'plugins.bundle.config' && r.key === pkg.name))
  assert.ok(rows.some((r) => r.name === 'plugins.row.config' && r.key === `${pkg.name}#dsh-unified`))
  assert.ok(rows.some((r) => r.name === 'plugins.item' && r.id === 'dsh-unified'))
  assert.ok(rows.some((r) => r.name === 'conversation.session.header.actions'))
  assert.ok(rows.some((r) => r.name === 'conversation.input.right'))
  assert.equal(locales.size, 2)
  for (const off of effects.reverse()) off()
  assert.equal(active.size, 0, 'disable/reload must release every registered UI seat')
  assert.equal(locales.size, 0)
})

test('settings namespace matches the shipped entry and updater targets this package', () => {
  const entry = read('lib/index.js')
  const patch = read('cordis.patch.yml')
  const panel = read('lib/panel.js')
  const namespace = entry.match(/const NS = '([^']+)'/)[1]
  assert.match(patch, new RegExp(`id: ${namespace}(?:\\r?\\n)`))
  assert.match(panel, new RegExp(`HUB_SETTINGS_NS = "${namespace}"`))
  assert.match(entry, /settingsSvc\.update\(NS,/)
  // The production fetch selector must use the same resolver as the offline
  // anonymous proxy test, rather than reject virtual refs as non-OAuth.
  assert.match(entry, /const fetchForRef = \(ref\) => proxyFetch\(proxyUrlForRef\(ref, live\(\)\.slots\)\)/)
  assert.match(read('lib/routes.js'), /packageName: '@dsh-unified\/dsh-plugin'/)
})
