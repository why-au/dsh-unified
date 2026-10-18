// Regression guard for the header quota pill showing a subscription's windows
// while the session was on a non-subscription model (2026-10-18).
//
// SubsPill used to print the most recently used subscription's quota whenever
// `state.active` existed, regardless of the model the session had selected. It
// now follows the session's current model: quota text is only built when that
// model's provider is one of the configured subscription providers.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

test('pill follows the selected model provider', () => {
  assert.match(src, /const selectedProvider = selection &&/)
  assert.match(src, /const subProviders = new Set\(state\.accounts\.map\(\(a\) => a\.provider\)\)/)
  assert.match(src, /const curIsSub = Boolean\(selectedProvider && subProviders\.has\(selectedProvider\)\)/)
  // The quota label must sit inside the curIsSub branch, not behind bare state.active.
  assert.match(src, /if \(curIsSub\) \{[\s\S]{0,900}pillText =/)
  assert.ok(!/if \(state\.active\) \{\s*const a = state\.active/.test(src), 'pill must not render active unconditionally')
})

test('header pill registers a selection reader', () => {
  assert.match(src, /inject: \(sessionId\) => \(\{[\s\S]{0,600}readSelection: async \(\) =>/)
  assert.match(src, /ctx\.get\('modelDirectories'\)/)
})

test('pill polls the selection', () => {
  assert.match(src, /const \[selection, setSelection\] = React\.useState\(null\)/)
  assert.match(src, /const id = setInterval\(read, 5000\)/)
})
