import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// End-to-end-ish check on the hub's own status route: a simulated WorkBuddy
// credential placed exactly where scan login writes it must make the channel
// appear in the hub document, without any connect-auth/ file.
const home = await mkdtemp(join(tmpdir(), 'dsh-hub-route-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = home
await mkdir(join(home, 'connect-auth'), { recursive: true })
// Mimic the desktop install that has one signed-in WorkBuddy account already.
await writeFile(join(home, '.workbuddy1-auth.json'), JSON.stringify({
  accessToken: 'simulated', refreshToken: 'simulated', expiresAtMs: Date.now() + 3600_000,
  domain: 'copilot.tencent.com', uid: 'simulated-uid', nickname: 'Simulated',
  signedInBy: 'scan', source: 'dsh',
}, null, 2))

const { hubChannels, slotConfigured } = await import('../lib/panel.js')
test.after(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

test('a scan-login credential surfaces the channel in the hub list', () => {
  assert.equal(slotConfigured('workbuddy1'), true)
  const rows = hubChannels().map((row) => row.id)
  assert.ok(rows.includes('workbuddy1'), `expected workbuddy1 in ${JSON.stringify(rows)}`)
  // Slots with no credential stay hidden, so the list has no phantom entries.
  assert.ok(!rows.includes('workbuddy2'))
  assert.ok(!rows.includes('trae'))
})
