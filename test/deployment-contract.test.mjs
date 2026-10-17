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
  // Every host package must share the SAME acceptance range: a mixed set would
  // be silently half-supported. Ranges are OR lists of exact DSH versions so
  // one tarball boots across the rc trains without needing per-version
  // exemptions; keep the invariant (one shared range) rather than a literal.
  const hostRanges = new Set()
  for (const [name, version] of Object.entries(pkg.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) hostRanges.add(version)
  }
  assert.equal(hostRanges.size, 1, `dsh-* peers disagree: ${[...hostRanges].join(', ')}`)
  const range = [...hostRanges][0]
  const versions = range.split(/\s*\|\|\s*/)
  assert.ok(versions.length >= 2, `range should cover several DSH versions, got: ${range}`)
  for (const v of versions) {
    assert.match(v, /^\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?$/, `range term not an exact DSH version: ${v}`)
  }
})

test('all top-level settings written by the full-config endpoint are volatile', () => {
  for (const [name, schema] of Object.entries(Config.dict)) {
    assert.equal(schema.meta.volatile, true, `${name} must be writable by settings.update`)
  }
})
