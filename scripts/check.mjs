// Dependency-free recursive syntax check; unlike node --check lib/*.js this
// checks every file on Windows too, without relying on shell glob expansion.
import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
let checked = 0
let failed = false
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await check(path)
    else if (/\.(?:js|mjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' })
      checked++
      if (result.error) { console.error(result.error); failed = true }
      if (result.status !== 0) failed = true
    }
  }
}
for (const dir of ['lib', 'test', 'scripts']) await check(join(root, dir))
console.log(`Syntax checked ${checked} JavaScript files. This is not a type check.`)
if (failed) process.exitCode = 1
