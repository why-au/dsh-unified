import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

// The workbuddy channel module cannot be imported standalone (it depends on
// host-provided dsh-home-paths / dsh-atomic-write), so these regressions are
// pinned against source, matching the style of channel-config.test.mjs.
// Measured 2026-10-17 on the CN endpoint (copilot.tencent.com):
//   reasoning_effort:"off"   -> 400/11133 invalid_request_error (deepseek-v4.1-flash)
//   reasoning_effort:"none"  -> 200, no reasoning content (thinking genuinely off)
//   reasoning_effort omitted -> 200 (upstream server default applies)
// Upstream dsh-workbuddy-trae-qoder-connect reached the same conclusion
// 2026-10-08 and additionally fixes empty-name tool calls, which deepseek
// also rejects with 400/11133.

function channelSource() {
  return {
    workbuddy: read('lib/channels/workbuddy/index.js'),
    venders: read('lib/vendors-extra/workbuddy.js'),
  }
}

test('vendors-extra/workbuddy.js stays byte-identical to the channel copy', () => {
  const { workbuddy, venders } = channelSource()
  assert.equal(workbuddy, venders, 'the legacy copy must not drift from the channel module')
})

test('off is never offered as a thinking level (guaranteed 400/11133 on CN)', () => {
  const { workbuddy } = channelSource()
  // The pi-ai adapter maps `off` from `thinkingLevelMap.off`; a non-null
  // mapping means the literal "off" reaches the wire and deepseek rejects it.
  assert.match(workbuddy, /off:\s*null,/)
  assert.doesNotMatch(workbuddy, /off:\s*reasoning\.canDisableThinking/)
  // The doc comment records why: measured 400/11133, mirroring upstream.
  assert.match(workbuddy, /rejects that spelling with 400\/11133/)
})

test('empty-name tool calls are repaired before the wire (another 400/11133 source)', () => {
  const { workbuddy } = channelSource()
  assert.match(workbuddy, /function repairToolPairing\(raw, logger\)/)
  assert.match(workbuddy, /degenerateIds/)
  assert.match(workbuddy, /空名调用会被上游判为非法参数、直接 400\/11133/)
})

test('unset reasoning_effort is completed with the catalog defaultEffort', () => {
  const { workbuddy } = channelSource()
  assert.match(workbuddy, /function withDefaultEffort\(raw, models\)/)
  // The shim wires both fixes before prepareChatBody's wire quirks run.
  assert.match(workbuddy, /prepareChatBody\(withDefaultEffort\(repairToolPairing\(raw, logger\), catalog\.current\(\)\)\)/)
})

test('the variants bundle still rewrites developer role and tool_choice', () => {
  const variants = read('lib/channels/workbuddy/variants-CnrmSn0Q.js')
  assert.match(variants, /function prepareChatBody\(source\)/)
  assert.match(variants, /normalizeDeveloperRole\(obj\)/)
  assert.match(variants, /normalizeToolChoice\(obj\)/)
})