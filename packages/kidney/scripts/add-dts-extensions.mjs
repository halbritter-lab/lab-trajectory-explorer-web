// The core sources import without file extensions, which bundlers accept but
// Node ESM type resolution (moduleResolution NodeNext) does not: there the
// emitted declarations would silently resolve to `any`. Add `.js` (or
// `/index.js`) to every relative specifier in dist/types.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/types')
const specifier = /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]*)\2/g

function declarationFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? declarationFiles(path) : path.endsWith('.d.ts') ? [path] : []
  })
}

for (const file of declarationFiles(root)) {
  const source = readFileSync(file, 'utf8')
  const fixed = source.replace(specifier, (match, lead, quote, spec) => {
    if (spec.endsWith('.js')) return match
    const target = resolve(dirname(file), spec)
    if (existsSync(`${target}.d.ts`)) return `${lead}${quote}${spec}.js${quote}`
    if (existsSync(join(target, 'index.d.ts'))) return `${lead}${quote}${spec}/index.js${quote}`
    throw new Error(`${file}: cannot resolve declaration import ${spec}`)
  })
  if (fixed !== source) writeFileSync(file, fixed)
}
