import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Config } from '../lib/config-schema.js'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('package is an activatable modern DSH bundle with a package-name overlay', () => {
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /^- insert:/m)
  assert.ok(patch.includes(`name: '${pkg.name}'`))
  assert.ok(!/^services:|^version:/m.test(patch))
  // Every host package must be pinned to the SAME version: the plugin targets one
  // exact DSH runtime at a time, and a mixed set would be silently half-supported.
  // The version itself moves with each DSH release, so pin the invariant, not a literal.
  const hostVersions = new Set()
  for (const [name, version] of Object.entries(pkg.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) hostVersions.add(version)
  }
  assert.equal(hostVersions.size, 1, `dsh-* peers disagree: ${[...hostVersions].join(', ')}`)
  assert.match([...hostVersions][0], /^\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?$/, 'pinned to an exact DSH version')
})

test('all top-level settings written by the full-config endpoint are volatile', () => {
  for (const [name, schema] of Object.entries(Config.dict)) {
    assert.equal(schema.meta.volatile, true, `${name} must be writable by settings.update`)
  }
})
