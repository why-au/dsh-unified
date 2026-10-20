// The WorkBuddy gateway's 400/11128 "Illegal API invocation from an unapproved
// channel" is a *transient* risk-control verdict, not a request-shape error:
// measured 2026-10-21, six identical minimal requests were blocked in a burst and
// the same requests returned 200 ten minutes later (10/10), and the upstream's
// own message says "Request blocked. Please send it again". chatStream therefore
// retries it a couple of times; deterministic 400s (11133 parameter errors, the
// international "first message is not system prompt") must not be retried.
import test from 'node:test'
import assert from 'node:assert/strict'
import { D as WorkBuddyUpstreamClient } from '../lib/channels/workbuddy/variants-CnrmSn0Q.js'

const credential = { accessToken: 'test-token', uid: 'test-uid', domain: 'www.codebuddy.cn' }
const body = JSON.stringify({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'hi' },
  ],
})

function client() {
  return new WorkBuddyUpstreamClient({
    resolveChatIdentity: async () => ({ clientVersion: '5.5.6' }),
    // Real schedule is 2s/5s/10s; keep tests fast.
    channelBlockDelaysMs: [1, 1, 1],
  })
}

function blockResponse() {
  return new Response(
    JSON.stringify({
      code: 11128,
      msg: 'Illegal API invocation from an unapproved channel',
      displayTips: { en: 'This call failed channel verification' },
    }),
    { status: 400, headers: { 'content-type': 'application/json' } },
  )
}

function okResponse() {
  return new Response('data: {}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function paramErrorResponse() {
  return new Response(
    JSON.stringify({ code: 11133, msg: 'invalid_request_error', error: { message: 'model_param_invalid' } }),
    { status: 400, headers: { 'content-type': 'application/json' } },
  )
}

async function withFetch(stub, run) {
  const original = globalThis.fetch
  globalThis.fetch = stub
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
}

test('a transient 11128 block is retried and the turn succeeds', async () => {
  let calls = 0
  const result = await withFetch(async () => {
    calls++
    return calls === 1 ? blockResponse() : okResponse()
  }, () => client().chatStream(credential, body))

  assert.equal(result.ok, true, 'second attempt should succeed')
  assert.equal(calls, 2, 'exactly one retry after the block')
})

test('11128 is retried a bounded number of times, then reported with a hint', async () => {
  let calls = 0
  const result = await withFetch(async () => {
    calls++
    return blockResponse()
  }, () => client().chatStream(credential, body))

  assert.equal(result.ok, false)
  assert.equal(calls, 4, 'initial attempt + 3 retries')
  assert.match(result.message, /11128/)
  // The exhausted path tells the user what to do (switch egress / retry later).
  assert.match(result.message, /换一个代理节点/)
})

test('deterministic 400s are NOT retried', async () => {
  let calls = 0
  const result = await withFetch(async () => {
    calls++
    return paramErrorResponse()
  }, () => client().chatStream(credential, body))

  assert.equal(result.ok, false)
  assert.equal(calls, 1, '11133 must surface immediately')
})
