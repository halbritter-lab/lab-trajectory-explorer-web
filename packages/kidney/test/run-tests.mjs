// Runs every *.node.mjs test of this folder. `node --test` expands a glob
// itself only from Node 21; the package supports Node 20.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = new URL('.', import.meta.url)
const files = readdirSync(dir).filter((name) => name.endsWith('.node.mjs')).map((name) => fileURLToPath(new URL(name, dir)))
if (files.length === 0) throw new Error('No *.node.mjs test found')
process.exit(spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' }).status ?? 1)
