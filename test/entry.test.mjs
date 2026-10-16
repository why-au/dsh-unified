import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('package entry imports with all channel dependencies in an isolated home', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-unified-entry-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const entry = await import('../lib/index.js')
    assert.equal(entry.name, 'dsh-unified')
    assert.equal(typeof entry.apply, 'function')
    assert.deepEqual(entry.inject, ['llm', 'credentials', 'webServer', 'settings'])
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
})
