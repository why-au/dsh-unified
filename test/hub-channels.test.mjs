import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('the hub fans out to the host-listened port, not a hardcoded default', () => {
  // Regression: loopbackBase() used to trust only DSH_PORT and otherwise fall
  // back to 3079. The host exposes the real port as webServer.port and does not
  // set DSH_PORT, so on any other port every channel row read
  // "unavailable: fetch failed" while the channels themselves were healthy.
  const source = readFileSync(new URL('../lib/panel.js', import.meta.url), 'utf8')
  assert.match(source, /hostWebPort = webCtx\.webServer\?\.port/)
  assert.match(source, /const fromHost = Number\(hostWebPort\)/)
  // The host port must be consulted before the DSH_PORT fallback.
  const hostIndex = source.indexOf('const fromHost = Number(hostWebPort)')
  const envIndex = source.indexOf('process.env.DSH_PORT')
  assert.ok(hostIndex !== -1 && envIndex !== -1 && hostIndex < envIndex, 'host port wins over DSH_PORT')
})
