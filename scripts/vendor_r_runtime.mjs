// Puts the R runtime (webR) and the pinned R packages next to the app, so a
// cohort model fit loads nothing from another host (K43). Run by `pnpm build`
// and `pnpm dev`; writes only below public/ (ignored by git):
//
//   public/webr/                                  webR runtime from the installed npm package `webr`
//   public/r-packages/bin/emscripten/contrib/4.6/ webR binary packages + PACKAGES index
//   public/r-packages/src/contrib/                the packages' CRAN source packages
//   public/THIRD-PARTY-NOTICES.txt, public/licenses/
//
// Pins live in src/core/mixedModel/rRuntimePins.json. A file whose SHA-256
// differs from its pin, or a webr package of another version, stops the
// script with exit code 1, and with it the build. Files already in place with
// the right checksum are not downloaded again.
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const PINS_FILE = join(ROOT, 'src/core/mixedModel/rRuntimePins.json')
const CRAN = 'https://cran.r-project.org/src/contrib'

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function verifyChecksum(buffer, expected, label) {
  const actual = sha256(buffer)
  if (actual !== expected) throw new Error(`Checksum mismatch for ${label}: expected ${expected}, got ${actual}`)
}

/** Major.minor of R, the directory name webR's installer uses below contrib/. */
export function rMinorVersion(rVersion) {
  return rVersion.split('.').slice(0, 2).join('.')
}

/** Digest over every runtime file: one "path sha256" line per file, sorted. */
export function runtimeDigest(dir) {
  const lines = listFiles(dir).map(file => `${relative(dir, file).split('\\').join('/')} ${sha256(readFileSync(file))}`)
  return sha256(Buffer.from(lines.sort().join('\n')))
}

function listFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

/** The PACKAGES index (Debian control format) of the pinned binary packages,
 * as read by webR's installer through read.dcf. */
export function packagesIndex(packages) {
  return packages.map(pkg => [
    `Package: ${pkg.name}`,
    `Version: ${pkg.version}`,
    pkg.depends ? `Depends: ${pkg.depends}` : null,
    pkg.imports ? `Imports: ${pkg.imports}` : null,
    `License: ${pkg.license}`,
    `File: ${pkg.name}_${pkg.version}.tgz`,
  ].filter(Boolean).join('\n')).join('\n\n') + '\n'
}

/** Reads one file from a gzipped tar archive (an R package archive). */
export function readFromTarGz(archive, wanted) {
  const tar = gunzipSync(archive)
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const field = (start, length) => header.subarray(start, start + length).toString('latin1').replace(/\0.*$/s, '')
    const name = (field(345, 155) ? `${field(345, 155)}/` : '') + field(0, 100)
    const size = Number.parseInt(field(124, 12).trim() || '0', 8)
    if (name === wanted) return tar.subarray(offset + 512, offset + 512 + size)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return null
}

/** DESCRIPTION fields, continuation lines joined. */
export function parseDescription(text) {
  const fields = {}
  let key = null
  for (const line of text.split(/\r?\n/)) {
    if (/^\s/.test(line) && key) fields[key] += ` ${line.trim()}`
    else if (line.includes(':')) {
      key = line.slice(0, line.indexOf(':'))
      fields[key] = line.slice(line.indexOf(':') + 1).trim()
    }
  }
  return fields
}

/** Checks that a binary package is the pinned one: checksum, and the name,
 * version and licence its DESCRIPTION states. */
export function verifyBinaryPackage(buffer, pkg) {
  verifyChecksum(buffer, pkg.binarySha256, `${pkg.name}_${pkg.version}.tgz`)
  const description = readFromTarGz(buffer, `${pkg.name}/DESCRIPTION`)
  if (!description) throw new Error(`${pkg.name}_${pkg.version}.tgz has no DESCRIPTION`)
  const fields = parseDescription(description.toString('utf8'))
  for (const [field, expected] of [['Package', pkg.name], ['Version', pkg.version], ['License', pkg.license]]) {
    if (fields[field] !== expected) throw new Error(`${pkg.name}: DESCRIPTION ${field} is "${fields[field]}", pinned "${expected}"`)
  }
}

async function download(urls, label) {
  const errors = []
  for (const url of urls) {
    try {
      const response = await fetch(url)
      if (response.ok) return Buffer.from(await response.arrayBuffer())
      errors.push(`${url}: HTTP ${response.status}`)
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`Could not download ${label}:\n  ${errors.join('\n  ')}`)
}

/** Keeps a file already in place when its checksum matches, else downloads it. */
async function fetchPinned(target, urls, verify, label) {
  if (existsSync(target)) {
    const existing = readFileSync(target)
    try { verify(existing); return existing } catch { rmSync(target) }
  }
  const buffer = await download(urls, label)
  verify(buffer)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, buffer)
  return buffer
}

export function thirdPartyNotices(pins) {
  const contrib = `r-packages/bin/emscripten/contrib/${rMinorVersion(pins.webr.rVersion)}`
  const lines = [
    'THIRD-PARTY NOTICES',
    '',
    'Lab Trajectory Explorer is distributed under the MIT licence (LICENSE in its',
    'repository). For cohort models it serves, next to the app and unmodified, the',
    'R runtime webR and the R packages listed below. They are separate programs that',
    'run in the browser in their own worker and receive R code and data from the',
    'app as messages. Each keeps its own licence, listed here. The licence texts are',
    'in licenses/ next to this file.',
    '',
    `webR ${pins.webr.version} (R ${pins.webr.rVersion} compiled to WebAssembly)`,
    `  Served at: webr/`,
    `  Licence: ${pins.webr.license}`,
    '  webr/LICENSE.md lists the further components webR contains (among them',
    '  PCRE2, XZ Utils, libgfortran) with their licences and holds the MIT and',
    '  GPL-3 texts.',
    `  Source: ${pins.webr.sourceUrls.join('\n          ')}`,
    '',
    `R packages (webR binary builds from ${pins.binaryRepository})`,
    `  Served at: ${contrib}/`,
    '  Source packages served at: r-packages/src/contrib/ (as published on CRAN)',
    '',
  ]
  for (const pkg of pins.packages) {
    lines.push(`${pkg.name} ${pkg.version}`, `  Licence: ${pkg.license}`)
    if (pkg.sourceSha256) lines.push(`  Source: r-packages/src/contrib/${pkg.name}_${pkg.version}.tar.gz (as on CRAN: https://cran.r-project.org/package=${pkg.name})`)
    else lines.push(`  Source: ${pkg.sourceNote}`)
    if (pkg.name === 'Matrix') lines.push('  Matrix contains SuiteSparse libraries under BSD-3-Clause, LGPL-2.1 (or later),', '  GPL-2 (or later) and Apache-2.0; their licence files are inside the package', '  archive (Matrix/LICENCE, Matrix/doc/SuiteSparse/).')
    if (pkg.name === 'jsonlite') lines.push('  Copyright notice: licenses/jsonlite-LICENSE (with the MIT text in licenses/MIT)')
    lines.push('')
  }
  lines.push(
    'Licence texts in licenses/: GPL-2, GPL-3, LGPL-3 (copied from R 4.6.0,',
    'share/licenses), MIT, jsonlite-LICENSE, Matrix-LICENCE (from the package',
    'archives). "GPL (>= 2)" means version 2 of the GNU GPL or any later version.',
    '',
  )
  return lines.join('\n')
}

const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

export async function vendorRRuntime({ root = ROOT, log = console.log } = {}) {
  const pins = JSON.parse(readFileSync(PINS_FILE, 'utf8'))
  const publicDir = join(root, 'public')

  // Runtime: the installed npm package, which the lockfile pins by integrity hash.
  const webrPackageDir = resolve(dirname(createRequire(join(root, 'package.json')).resolve('webr')), '..')
  const webrPackage = JSON.parse(readFileSync(join(webrPackageDir, 'package.json'), 'utf8'))
  if (webrPackage.version !== pins.webr.version) throw new Error(`Installed webr is ${webrPackage.version}, pinned ${pins.webr.version}`)
  const runtimeDir = join(publicDir, 'webr')
  rmSync(runtimeDir, { recursive: true, force: true })
  mkdirSync(runtimeDir, { recursive: true })
  for (const file of pins.webr.files) cpSync(join(webrPackageDir, 'dist', file), join(runtimeDir, file), { recursive: true })
  copyFileSync(join(webrPackageDir, 'LICENSE.md'), join(runtimeDir, 'LICENSE.md'))
  const digest = runtimeDigest(runtimeDir)
  if (digest !== pins.webr.runtimeSha256) throw new Error(`Checksum mismatch for the webR runtime files: expected ${pins.webr.runtimeSha256}, got ${digest}`)

  // Binary packages and their index.
  const contribDir = join(publicDir, 'r-packages/bin/emscripten/contrib', rMinorVersion(pins.webr.rVersion))
  const binaries = {}
  for (const pkg of pins.packages) {
    const file = `${pkg.name}_${pkg.version}.tgz`
    binaries[pkg.name] = await fetchPinned(join(contribDir, file), [`${pins.binaryRepository}/${file}`], buffer => verifyBinaryPackage(buffer, pkg), file)
  }
  const pinnedFiles = new Set(pins.packages.map(pkg => `${pkg.name}_${pkg.version}.tgz`))
  for (const name of readdirSync(contribDir)) if (name.endsWith('.tgz') && !pinnedFiles.has(name)) rmSync(join(contribDir, name))
  const index = packagesIndex(pins.packages)
  writeFileSync(join(contribDir, 'PACKAGES'), index)
  writeFileSync(join(contribDir, 'PACKAGES.gz'), gzipSync(Buffer.from(index)))

  // Source packages, for the GPL's source-availability terms.
  const sourceDir = join(publicDir, 'r-packages/src/contrib')
  for (const pkg of pins.packages.filter(p => p.sourceSha256)) {
    const file = `${pkg.name}_${pkg.version}.tar.gz`
    await fetchPinned(join(sourceDir, file), [`${CRAN}/${file}`, `${CRAN}/Archive/${pkg.name}/${file}`], buffer => verifyChecksum(buffer, pkg.sourceSha256, file), file)
  }

  // Notices and licence texts.
  const licenseDir = join(publicDir, 'licenses')
  rmSync(licenseDir, { recursive: true, force: true })
  mkdirSync(licenseDir, { recursive: true })
  for (const name of ['GPL-2', 'GPL-3', 'LGPL-3']) copyFileSync(join(root, 'third-party/licenses', name), join(licenseDir, name))
  writeFileSync(join(licenseDir, 'MIT'), MIT_TEXT)
  writeFileSync(join(licenseDir, 'jsonlite-LICENSE'), readFromTarGz(binaries.jsonlite, 'jsonlite/LICENSE'))
  writeFileSync(join(licenseDir, 'Matrix-LICENCE'), readFromTarGz(binaries.Matrix, 'Matrix/LICENCE'))
  writeFileSync(join(publicDir, 'THIRD-PARTY-NOTICES.txt'), thirdPartyNotices(pins))

  const size = dir => listFiles(dir).reduce((sum, file) => sum + statSync(file).size, 0)
  log(`R runtime vendored: webR ${pins.webr.version} (R ${pins.webr.rVersion}) ${(size(runtimeDir) / 1e6).toFixed(1)} MB, ${pins.packages.length} packages ${(size(contribDir) / 1e6).toFixed(1)} MB, sources ${(size(sourceDir) / 1e6).toFixed(1)} MB`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  vendorRRuntime().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
