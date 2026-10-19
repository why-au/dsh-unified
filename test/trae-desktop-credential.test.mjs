// Trae desktop credential: envelope round-trip + discovery wiring.
//
// The "tc" envelope is documented by the MIT-licensed Trae2api-cn project:
//   [6B "tc\x05\x10\x00\x00"][32B random][AES-128-CBC ciphertext]
//   plaintext = [64B SHA-512(body)][PKCS#7-padded body]
//   key/iv    = SHA-512(SHA-512(random) || SALT_A^SALT_B)[0..16]/[16..32]
// This test encrypts a sample the same way and checks the plugin decrypts it,
// so the ported implementation cannot silently drift from the documented
// algorithm (a wrong key would just fail the hash check at runtime).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createCipheriv } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { decryptStorageValue } from '../lib/trae-desktop.js'

const SALT_A = Buffer.from([
  82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251,
  124, 227, 57, 130, 155, 47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203,
  84, 123, 148, 50, 166, 194, 35, 61, 238, 76, 149, 11, 66, 250, 195, 78,
  8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37,
])
const SALT_B = Buffer.from([
  31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95,
  96, 81, 127, 169, 25, 181, 74, 13, 45, 229, 122, 159, 147, 201, 156, 239,
  160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187, 60, 131, 83, 153, 97,
  23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125,
])

function sealTc(plaintext, random = Buffer.alloc(32, 7)) {
  const body = Buffer.from(plaintext, 'utf8')
  const padLength = 16 - (body.length % 16)
  const padded = Buffer.concat([body, Buffer.alloc(padLength, padLength)])
  const digest = createHash('sha512').update(body).digest()
  const payload = Buffer.concat([digest, padded])
  const salt = Buffer.alloc(64)
  for (let i = 0; i < 64; i++) salt[i] = SALT_A[i] ^ SALT_B[i]
  const finalHash = createHash('sha512')
    .update(Buffer.concat([createHash('sha512').update(random).digest(), salt]))
    .digest()
  const cipher = createCipheriv('aes-128-cbc', finalHash.subarray(0, 16), finalHash.subarray(16, 32))
  cipher.setAutoPadding(false)
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()])
  const header = Buffer.from([0x74, 0x63, 0x05, 0x10, 0x00, 0x00])
  return Buffer.concat([header, random, encrypted]).toString('base64')
}

test('decrypts a tc envelope back to the JSON it sealed', () => {
  const record = JSON.stringify({ token: 'jwt-token-value', userId: 'u-1', host: 'https://api.trae.cn' })
  const sealed = sealTc(record)
  assert.equal(decryptStorageValue(sealed), record)
})

test('rejects a corrupted payload instead of returning garbage', () => {
  const sealed = Buffer.from(sealTc(JSON.stringify({ token: 'x' })), 'base64')
  sealed[sealed.length - 1] ^= 0xff
  assert.throws(() => decryptStorageValue(sealed.toString('base64')))
})

const traeChannel = readFileSync(new URL('../lib/channels/trae/index.js', import.meta.url), 'utf8')
const panelClient = readFileSync(new URL('../lib/panel-client.js', import.meta.url), 'utf8')

test('the Trae channel falls back to the desktop app before failing', () => {
  assert.match(traeChannel, /import \{ discoverDesktopAuth \} from "\.\.\/\.\.\/trae-desktop\.js"/)
  assert.match(traeChannel, /const desktop = discoverDesktopAuth\(\{ logger \}\)/)
  // The old "run export-trae-plain.mjs" dead end must be gone.
  assert.ok(!/先在宿主机跑 scripts\/export-trae-plain\.mjs/.test(traeChannel))
})

test('channel panel shows per-kind credential guidance and a taller dialog', () => {
  assert.match(panelClient, /row\.kind === "qoder"/)
  assert.match(panelClient, /qoderPatHint/)
  assert.match(panelClient, /traeAutoHint/)
  // 认证页放不下：加宽加高 + 根节点撑满（否则内部滚动区拿不到高度）。
  assert.match(panelClient, /width: "min\(660px, calc\(100vw - 32px\)\)"/)
  assert.match(panelClient, /maxHeight: "min\(86vh, 820px\)"/)
  assert.match(panelClient, /flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column"/)
})
