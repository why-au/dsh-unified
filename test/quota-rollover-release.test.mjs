// Regression guard for "5h quota reset but still unusable" (2026-10-18).
//
// When a 429 parks an account, the cooldown/quarantine deadline comes from the
// upstream reset header, which can point past the real window roll-over. The
// account then stayed cooled while the 5h window had already refilled (usage
// 0%), and every request was refused until the hour expired. refreshUsage now
// detects a decreasing usedPercent and releases the slot.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/accounts.js', import.meta.url), 'utf8')

test('refreshUsage captures the previous overall percentage before overwriting it', () => {
  assert.match(src, /const prevOverall = numberOrNull\(usage\.get\(slot\.ref\)\)/)
  // It must be captured before usage.set() overwrites the value.
  const captureAt = src.indexOf('const prevOverall = numberOrNull(usage.get(slot.ref))')
  const setAt = src.indexOf('usage.set(slot.ref, usedPercent)')
  assert.ok(captureAt > 0 && setAt > 0 && captureAt < setAt, 'prevOverall must be read before usage.set')
})

test('a quota roll-over releases cooldown and quarantine', () => {
  assert.match(src, /let rolledOver = usedPercent != null && prevOverall != null && usedPercent < prevOverall/)
  assert.match(src, /if \(rolledOver\) \{[\s\S]{0,220}cooldowns\.delete\(slot\.ref\)/)
  assert.match(src, /if \(rolledOver\) \{[\s\S]{0,320}quarantines\.delete\(slot\.ref\)/)
  assert.match(src, /saveQuarantinesToFile\(quarantines\)/)
})

test('window-level percentages are also compared', () => {
  assert.match(src, /const prevWindows = windows\.get\(slot\.ref\) \|\| \[\]/)
  assert.match(src, /if \(pct != null && before != null && pct < before\) \{ rolledOver = true; break \}/)
})
