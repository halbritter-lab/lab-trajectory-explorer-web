// Checks that every relative link in the tracked Markdown files resolves:
// the target file exists and, for a Markdown target, the #anchor is a heading.
// Run from the repository root: node scripts/check_doc_links.mjs [path prefix …]
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

const prefixes = process.argv.slice(2)
const files = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter(file => prefixes.length === 0 || prefixes.some(prefix => file.startsWith(prefix)))

/** Lines outside fenced code blocks, with their 1-based line numbers. */
function proseLines(text) {
  const out = []
  let fence = false
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trimStart().startsWith('```')) fence = !fence
    else if (!fence) out.push([index + 1, line])
  })
  return out
}

// GitHub's heading anchors: lower case, drop everything but letters, digits,
// `_`, `-` and spaces, spaces to hyphens, repeats numbered -1, -2, ….
const anchorCache = new Map()
function anchorsOf(file) {
  if (!anchorCache.has(file)) {
    const seen = new Map()
    const anchors = new Set()
    for (const [, line] of proseLines(readFileSync(file, 'utf8'))) {
      const heading = /^#{1,6} +(.*)$/.exec(line)
      if (!heading) continue
      const slug = heading[1].trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replaceAll(' ', '-')
      const count = seen.get(slug) ?? 0
      seen.set(slug, count + 1)
      anchors.add(count === 0 ? slug : `${slug}-${count}`)
    }
    anchorCache.set(file, anchors)
  }
  return anchorCache.get(file)
}

let links = 0
const broken = []
for (const file of files) {
  for (const [lineNumber, line] of proseLines(readFileSync(file, 'utf8'))) {
    for (const match of line.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1]
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
      links++
      const [path, anchor] = target.split('#')
      const resolved = path === '' ? file : normalize(join(dirname(file), decodeURIComponent(path)))
      if (!existsSync(resolved)) broken.push(`${file}:${lineNumber}: ${target} (no such file)`)
      else if (anchor && resolved.endsWith('.md') && !anchorsOf(resolved).has(decodeURIComponent(anchor))) {
        broken.push(`${file}:${lineNumber}: ${target} (no such heading)`)
      }
    }
  }
}

console.log(`${files.length} Markdown files, ${links} relative links, ${broken.length} broken`)
for (const entry of broken) console.log(entry)
process.exit(broken.length > 0 ? 1 : 0)
