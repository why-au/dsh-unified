// Regression guard for the Codex "always times out" failure (2026-10-18).
//
// Root cause: the plugin's SSE reader defaulted to a 60s idle timeout while the
// host's own pi-ai watchdog allows 300s. A reasoning model that pauses longer
// than a minute mid-thought tripped the plugin first, and the rotation layer
// classified the timeout as RATE_LIMIT, quarantining the only Codex account for
// a full hour — so every later turn failed until a manual release.
//
// These are source assertions (no network): they pin the three settings that
// must stay wide enough for slow reasoning turns.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(`../lib/${name}`, import.meta.url), 'utf8')

test('responses stream allows 300s of silence (matches the host watchdog)', () => {
  const src = read('responses-stream.js')
  assert.match(src, /const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000/)
  assert.match(src, /iterateSse\(body, \{ idleTimeoutMs \}\)/)
})

test('codex TTFB timeout is wide enough for large agent payloads', () => {
  const src = read('adapter.js')
  const match = src.match(/const TTFB_TIMEOUT_MS = (\d+)/)
  assert.ok(match, 'TTFB_TIMEOUT_MS constant missing')
  assert.ok(Number(match[1]) >= 180000, `TTFB timeout too tight: ${match[1]}ms`)
})

test('a stream timeout degrades the account instead of quarantining it for an hour', () => {
  const src = read('stream-rotate.js')
  // Timeout must join the soft-failure branch: 5-minute degraded window.
  assert.match(src, /const isTimeout = code === 'TIMEOUT' \|\| Boolean\(err && err\.name === 'TimeoutError'\)/)
  assert.match(src, /const isSoft = Boolean\(err && \(err\.code === 'SOFT_FAILURE' \|\| err\.isSoftFailure\)\) \|\| isTimeout/)
  // And it must pick REASON_DEGRADED, not the RATE_LIMIT fallthrough.
  assert.match(src, /const reason = isSoft\s*\? REASON_DEGRADED/)
})

test('quarantine durations stay as documented', async () => {
  const { quarantineDuration, REASON_RATE_LIMIT, REASON_DEGRADED } = await import('../lib/quarantine.js')
  assert.equal(quarantineDuration(REASON_DEGRADED), 5 * 60 * 1000)
  assert.equal(quarantineDuration(REASON_RATE_LIMIT), 60 * 60 * 1000)
})
