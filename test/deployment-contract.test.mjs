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
  for (const [name, version] of Object.entries(pkg.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(version, '0.2.0-rc.2', name)
  }
})

test('all top-level settings written by the full-config endpoint are volatile', () => {
  for (const [name, schema] of Object.entries(Config.dict)) {
    assert.equal(schema.meta.volatile, true, `${name} must be writable by settings.update`)
  }
})
