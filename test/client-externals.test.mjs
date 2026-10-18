// Regression guard for the "connected channels show nothing" report (2026-10-18).
//
// DSH 0.2.1 stopped shipping @deepseek-ai/dsh-client-ui-primitives. The plugin's
// browser bundle required it inside a try/catch for one chevron icon, and the
// host's module loader records/throws on any specifier that misses the module
// table ("build-time externals drift"). The only primitive used was that
// chevron, so the dependency was dropped and the icon drawn inline. These
// assertions keep the browser bundle limited to modules the host always seeds
// (react / react-dom).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const bundle = readFileSync(new URL('../lib/client.bundle.js', import.meta.url), 'utf8')

test('browser externals are limited to react and react-dom', () => {
  const external = pkg.dsh.client.external
  assert.deepEqual([...external].sort(), ['react', 'react-dom'])
  // No @deepseek-ai/* package may be declared external: the host only seeds a
  // fixed set, and a removed one breaks the whole client half.
  for (const name of external) {
    assert.ok(!name.startsWith('@deepseek-ai/'), `unexpected host external: ${name}`)
  }
})

test('bundle never requires a removed host package such as ui-primitives', () => {
  const requires = [...bundle.matchAll(/require\((['"])([^'"]+)\1\)/g)].map((m) => m[2])
  const externals = new Set(requires.filter((spec) => !spec.startsWith('.')))
  for (const spec of externals) {
    assert.ok(['react', 'react-dom'].includes(spec), `bundle requires non-seed module: ${spec}`)
  }
  assert.ok(!bundle.includes("require('@deepseek-ai/dsh-client-ui-primitives')"), 'ui-primitives require must be gone')
})

test('the chevron icon is drawn inline instead of imported', () => {
  assert.match(bundle, /function FallbackChevron/)
  assert.match(bundle, /viewBox: '0 0 14 14'/)
})
