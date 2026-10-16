import test from 'node:test'
import assert from 'node:assert/strict'
import { streamOnce, sessionIdsFor } from '../lib/vendors/zen.js'

function sse(chunks) {
  return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n')
}

async function request(options, response = sse([{ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }])) {
  let captured
  const events = []
  for await (const event of streamOnce({ options, config: {}, fetchImpl: async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) }
    return response
  } })) events.push(event)
  return { ...captured, events }
}

const options = { model: 'big-pickle', sessionId: 'zen-test', messages: [{ role: 'user', content: 'hello' }] }

test('Zen preserves real tools and never replaces bash/read schemas', async () => {
  const tools = ['bash', 'read', 'edit'].map((name) => ({ name, description: `real ${name}`, parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }))
  const { body, events } = await request({ ...options, tools })
  assert.deepEqual(body.tools.map((tool) => tool.function), tools)
  assert.equal(body.tool_choice, undefined)
  assert.ok(events.some((event) => event.type === 'text-delta' && event.text === 'OK'))
})

test('Zen fills only missing gate tools, and plain chat disables tool calls', async () => {
  const realRead = { name: 'read', description: 'Read a real file', parameters: { type: 'object', properties: { path: { type: 'string' } } } }
  const { body } = await request({ ...options, tools: [realRead] })
  assert.equal(body.tools.length, 2)
  assert.deepEqual(body.tools[0].function, realRead)
  assert.equal(body.tools[1].function.name, 'bash')
  const plain = await request(options)
  assert.equal(plain.body.tool_choice, 'none')
})

test('Zen forwards tool call arguments and subsequent tool results', async () => {
  const response = sse([
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_read', function: { name: 'read', arguments: '{"path":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"README.md"}' } }] }, finish_reason: 'tool_calls' }] },
  ])
  const { events } = await request(options, response)
  const calls = events.filter((event) => event.type === 'tool-call-delta')
  assert.equal(calls[0].name, 'read')
  assert.equal(calls.map((event) => event.argumentsDelta).join(''), '{"path":"README.md"}')
  assert.equal(events.at(-1).reason.kind, 'tool-calls')
  const next = await request({ ...options, messages: [...options.messages,
    { role: 'assistant', tool_calls: [{ id: 'call_read', function: { name: 'read', arguments: '{"path":"README.md"}' } }] },
    { role: 'tool', tool_call_id: 'call_read', content: 'file contents' },
  ] })
  assert.deepEqual(next.body.messages.at(-1), { role: 'tool', tool_call_id: 'call_read', content: 'file contents' })
})

test('Zen classifies rate limits for rotation and reuses session affinity', async () => {
  await assert.rejects(request(options, new Response('rate limited', { status: 429 })), (err) => err.code === 'RATE_LIMIT' && err.status === 429)
  assert.equal(sessionIdsFor('same'), sessionIdsFor('same'))
  assert.notEqual(sessionIdsFor('first').session, sessionIdsFor('second').session)
})
