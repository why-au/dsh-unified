import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('channel modules are applied with an object config, never undefined', () => {
  const entry = read('lib/index.js')
  // Regression: index.js used to call `chModule.apply(ctx, undefined)`. The
  // workbuddy channel reads `config.authFile` synchronously inside apply(), so
  // it threw before registering its provider; index.js's catch downgraded that
  // to a warning and the hub then showed the channel as "unavailable:
  // fetch failed" because the provider's routes were never mounted.
  assert.ok(!/chModule\.apply\(ctx, undefined\)/.test(entry), 'must not pass undefined')
  assert.match(entry, /chModule\.apply\(ctx, \{\}\)/)
})

test('every channel module tolerates a config object without its optional fields', () => {
  // The three channels are called the same way; guard the shared assumption by
  // requiring each to either default the argument or avoid bare config reads.
  const channels = {
    workbuddy: read('lib/channels/workbuddy/index.js'),
    trae: read('lib/channels/trae/index.js'),
    qoder: read('lib/channels/qoder/index.js'),
  }
  for (const [name, source] of Object.entries(channels)) {
    assert.match(source, /function apply\(ctx, config\)/, `${name} should declare apply(ctx, config)`)
  }
  // trae/qoder normalize with `config ?? {}`; workbuddy relies on the caller now
  // passing an object, which the first test pins. Record which is which so a
  // future change that removes BOTH guards fails here.
  const normalized = ['trae', 'qoder'].filter((name) => /config \?\? \{\}/.test(channels[name]))
  assert.deepEqual(normalized, ['trae', 'qoder'], 'trae/qoder keep their own guard')
  assert.match(channels.workbuddy, /typeof config\.authFile === "string"/)
})
