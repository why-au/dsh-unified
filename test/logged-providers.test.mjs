// Regression guard for "connected channels all show not connected" (2026-10-18).
//
// The account-pool popup derived its logged-in list by filtering a hardcoded
// ORDER of four providers (codex/claude/grok/antigravity). zen, kimi, glm and
// anything else logged in therefore rendered as "not connected" forever, even
// though /dsh-subscriptions/status reported them configured. The slash-command
// provider matcher had the same flaw, so /login only worked for four providers.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

test('logged providers come from the status payload, not a hardcoded shortlist', () => {
  // The buggy line must be gone.
  assert.ok(!/const logged = ORDER\.filter\(\(p\) => loggedIn\[p\]\)/.test(src), 'logged must not be ORDER-filtered')
  // It must enumerate every loggedIn key.
  assert.match(src, /const allLogged = Object\.keys\(loggedIn\)\.filter\(\(p\) => loggedIn\[p\]\)/)
  assert.match(src, /const logged = \[\.\.\.ORDER\.filter\(\(p\) => allLogged\.includes\(p\)\)/)
  assert.match(src, /\.\.\.allLogged\.filter\(\(p\) => !ORDER\.includes\(p\)\)\]/)
})

test('ORDER is documented as a sort preference only', () => {
  assert.match(src, /\/\/ Sort preference only\./)
})

test('slash-command provider matcher accepts any provider id shape', () => {
  assert.ok(!/new RegExp\('\^\(' \+ ORDER\.join/.test(src), 'providerMatch must not be built from ORDER')
  assert.match(src, /const providerMatch = \/\^\[a-z\]\[a-z0-9_\]\*\$\/;?/)
})
