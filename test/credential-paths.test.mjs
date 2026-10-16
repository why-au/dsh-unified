import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// panel.js resolves credential paths through resolveDshHome() at call time, so a
// temporary DSH_HOME is enough; no user home or credentials are read.
const home = await mkdtemp(join(tmpdir(), 'dsh-credpath-'))
const previousHome = process.env.DSH_HOME
const previousEnv = {
  WORKBUDDY1_AUTH_FILE: process.env.WORKBUDDY1_AUTH_FILE,
  WORKBUDDY2_AUTH_FILE: process.env.WORKBUDDY2_AUTH_FILE,
}
process.env.DSH_HOME = home
delete process.env.WORKBUDDY1_AUTH_FILE
delete process.env.WORKBUDDY2_AUTH_FILE

const { slotConfigured } = await import('../lib/panel.js')
const write = async (rel, body = '{}') => {
  const path = join(home, rel)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, body)
}
const clear = async (...rels) => {
  for (const rel of rels) await rm(join(home, rel), { force: true })
}
test.after(async () => {
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

test('panel recognises the credential the WorkBuddy sign-in flow actually writes', async (t) => {
  await t.test('nothing configured', () => {
    assert.equal(slotConfigured('workbuddy1'), false)
  })

  await t.test('panel write target (connect-auth) counts as configured', async () => {
    await write('connect-auth/workbuddy1.json', '{"auth":{"accessToken":"x"}}')
    assert.equal(slotConfigured('workbuddy1'), true)
    await clear('connect-auth/workbuddy1.json')
  })

  await t.test('scan-login copy counts as configured', async () => {
    // Regression: the panel used to check only connect-auth/, so a successful
    // scan login left the channel missing from the hub while the account worked.
    await write('.workbuddy1-auth.json', '{"accessToken":"x"}')
    assert.equal(slotConfigured('workbuddy1'), true)
    await clear('.workbuddy1-auth.json')
  })

  await t.test('environment override is honoured', async () => {
    const override = join(home, 'elsewhere', 'wb1.json')
    process.env.WORKBUDDY1_AUTH_FILE = override
    await write('elsewhere/wb1.json', '{"auth":{"accessToken":"x"}}')
    assert.equal(slotConfigured('workbuddy1'), true)
    await clear('elsewhere/wb1.json')
    delete process.env.WORKBUDDY1_AUTH_FILE
  })

  await t.test('one slot cannot borrow another slot credential', async () => {
    // The provider pins each slot to its own file so an empty slot never falls back
    // to a shared desktop file; the panel must not report slot 2 from slot 1's file.
    await write('.workbuddy1-auth.json', '{"accessToken":"x"}')
    assert.equal(slotConfigured('workbuddy1'), true)
    assert.equal(slotConfigured('workbuddy2'), false)
    await clear('.workbuddy1-auth.json')
  })

  await t.test('a bare desktop-app install is not reported as a configured slot', async () => {
    // workbuddy slots intentionally do not read the desktop App file, so its mere
    // presence must not mark the slot configured (that would show a phantom account).
    const desktop = join(home, 'AppData', 'Local', 'CodeBuddyExtension', 'Data', 'Public', 'auth', 'workbuddy-desktop.info')
    await mkdir(join(desktop, '..'), { recursive: true })
    await writeFile(desktop, '{}')
    assert.equal(slotConfigured('workbuddy1'), false)
  })

  await t.test('qoder keeps session-then-pat candidates', async () => {
    assert.equal(slotConfigured('qoder'), false)
    await write('connect-auth/qoder.pat', 'pt-abc')
    assert.equal(slotConfigured('qoder'), true)
    await clear('connect-auth/qoder.pat')
  })

  await t.test('trae uses the documented snapshot path', async () => {
    assert.equal(slotConfigured('trae'), false)
    await write('connect-auth/trae.json', '{}')
    assert.equal(slotConfigured('trae'), true)
    await clear('connect-auth/trae.json')
  })
})
