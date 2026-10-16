import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
function materialize() {
  let entry
  const styles = []
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load: (value) => { entry = value } } },
    document: {
      querySelector: () => null,
      createElement: () => ({ dataset: {}, setAttribute() {} }),
      head: { appendChild: (value) => styles.push(value) },
    }, console,
  })
  entry.factory((name) => {
    if (name === 'react') return { Component: class {}, createElement() {} }
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return {}
    throw new Error(name)
  })
  return styles.map((style) => style.textContent).join('\n')
}

test('settings factory injects theme-aware responsive UI and keyboard/reduced-motion styles', () => {
  const css = materialize()
  for (const selector of ['.dsub-hero', '.dsub-account-card', '.dsub-account-toolbar', '.dsub-provider-heading', ':focus-visible', '@media(max-width:600px)', '@media(prefers-reduced-motion:reduce)']) {
    assert.ok(css.includes(selector), selector)
  }
  assert.ok(css.includes('var(--dsw-alias-label-primary)'))
  assert.ok(css.includes('.dsub-wrap .dsub-mini:disabled'))
})

test('account controls keep labels and hide manual token input by default', () => {
  assert.match(source, /type: 'password',[\s\S]{0,140}'aria-label': t\('importToken'\)/)
  assert.match(source, /'aria-label': t\('removeSlot'\)/)
  assert.match(source, /className: 'dsub-card dsub-account-card'/)
  assert.match(source, /className: 'dsub-provider-heading'/)
  assert.match(source, /telemetry\.successRate \?\? 100/, 'zero percent must not render as 100%')
  assert.ok(!source.includes("'Pool: '"), 'pool label is localized')
})
