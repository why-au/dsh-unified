// Regression guard for "fetch failed" on the Codex subscription (2026-10-18).
//
// The machine routes outbound traffic through a local proxy (v2rayN).
// Occasional socket resets surface as `TypeError: fetch failed` with the real
// reason in err.cause.code. Those errors carry no HTTP status, so the old code
// classified them as fatal and failed the whole turn without a retry. The fix
// recognises transport failures and retries the same account up to 3 times.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isNetworkError, isSwitchableError } from '../lib/rotate.js'

const read = (name) => readFileSync(new URL(`../lib/${name}`, import.meta.url), 'utf8')

test('isNetworkError recognises undici transport failures', () => {
  const fetchFailed = new TypeError('fetch failed')
  fetchFailed.cause = { code: 'UND_ERR_SOCKET' }
  assert.equal(isNetworkError(fetchFailed), true)

  const reset = new TypeError('fetch failed')
  reset.cause = { code: 'ECONNRESET' }
  assert.equal(isNetworkError(reset), true)

  const refused = new TypeError('fetch failed')
  refused.cause = { code: 'ECONNREFUSED' }
  assert.equal(isNetworkError(refused), true)

  const dns = new TypeError('fetch failed')
  dns.cause = { code: 'EAI_AGAIN' }
  assert.equal(isNetworkError(dns), true)

  // Aborts are the user cancelling; never retry those.
  const abort = new TypeError('fetch failed')
  abort.name = 'AbortError'
  abort.cause = { code: 'ECONNRESET' }
  assert.equal(isNetworkError(abort), false)

  // Ordinary HTTP errors must not be treated as transport failures.
  const rateLimited = Object.assign(new Error('rate limited'), { status: 429, code: 'RATE_LIMIT' })
  assert.equal(isNetworkError(rateLimited), false)
  // ...and they stay switchable so rotation still works.
  assert.equal(isSwitchableError(rateLimited), true)
})

test('rotation retries transport failures before failing the turn', () => {
  const src = read('stream-rotate.js')
  assert.match(src, /import \{[^}]*isNetworkError[^}]*\} from '\.\/rotate\.js'/)
  assert.match(src, /let networkRetries = 0/)
  assert.match(src, /if \(isNetworkError\(err\) && networkRetries < 3/)
})
