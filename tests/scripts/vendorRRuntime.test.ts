import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
// @ts-expect-error -- plain JavaScript build script without type declarations
import { packagesIndex, parseDescription, readFromTarGz, sha256, thirdPartyNotices, verifyBinaryPackage, verifyChecksum } from '../../scripts/vendor_r_runtime.mjs'
import pins from '../../src/core/mixedModel/rRuntimePins.json'

function tarGz(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = []
  for (const [name, content] of Object.entries(files)) {
    const header = Buffer.alloc(512)
    header.write(name, 0, 'latin1')
    header.write(Buffer.byteLength(content).toString(8).padStart(11, '0'), 124, 'latin1')
    blocks.push(header, Buffer.concat([Buffer.from(content)], Math.ceil(Buffer.byteLength(content) / 512) * 512))
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}

const lme4 = pins.packages.find(pkg => pkg.name === 'lme4')!
const description = `Package: lme4\nVersion: 2.0-6\nLicense: GPL (>= 2)\nImports: MASS,\n    boot\n`

describe('vendor_r_runtime.mjs (K43)', () => {
  it('stops on a file whose checksum differs from its pin', () => {
    expect(() => verifyChecksum(Buffer.from('changed'), sha256(Buffer.from('pinned')), 'x.tgz')).toThrow(/Checksum mismatch for x\.tgz/)
    expect(() => verifyChecksum(Buffer.from('pinned'), sha256(Buffer.from('pinned')), 'x.tgz')).not.toThrow()
    expect(() => verifyBinaryPackage(tarGz({ 'lme4/DESCRIPTION': description }), lme4)).toThrow(/Checksum mismatch for lme4_2\.0-6\.tgz/)
  })

  it('stops on a package whose DESCRIPTION states another version than pinned', () => {
    const archive = tarGz({ 'lme4/DESCRIPTION': description.replace('2.0-6', '2.0-7') })
    expect(() => verifyBinaryPackage(archive, { ...lme4, binarySha256: sha256(archive) })).toThrow('lme4: DESCRIPTION Version is "2.0-7", pinned "2.0-6"')
    const good = tarGz({ 'lme4/DESCRIPTION': description })
    expect(() => verifyBinaryPackage(good, { ...lme4, binarySha256: sha256(good) })).not.toThrow()
  })

  it('reads one file from a package archive and joins continuation lines', () => {
    const archive = tarGz({ 'lme4/NAMESPACE': 'x', 'lme4/DESCRIPTION': description })
    expect(parseDescription(readFromTarGz(archive, 'lme4/DESCRIPTION').toString())).toMatchObject({ Imports: 'MASS, boot' })
    expect(readFromTarGz(archive, 'lme4/LICENSE')).toBeNull()
  })

  it('writes a PACKAGES index with one record per pinned package', () => {
    const index = packagesIndex(pins.packages)
    expect(index.split('\n\n')).toHaveLength(pins.packages.length)
    expect(index).toContain(`Package: lme4\nVersion: 2.0-6\nDepends: ${lme4.depends}\nImports: ${lme4.imports}\nLicense: GPL (>= 2)\nFile: lme4_2.0-6.tgz`)
    expect(index).toContain('Package: nloptr\nVersion: 2.2.1.9000\nLicense: LGPL (>= 3)\nFile: nloptr_2.2.1.9000.tgz')
  })

  it('lists every component with version, licence and source in the notices', () => {
    const notices = thirdPartyNotices(pins)
    expect(notices).toContain('webR 0.6.0 (R 4.6.0 compiled to WebAssembly)')
    expect(notices).toContain('https://github.com/r-wasm/webr/tree/v0.6.0')
    for (const pkg of pins.packages) {
      expect(notices).toContain(`${pkg.name} ${pkg.version}\n  Licence: ${pkg.license}\n  Source: `)
      if (pkg.sourceSha256) expect(notices).toContain(`r-packages/src/contrib/${pkg.name}_${pkg.version}.tar.gz`)
    }
    expect(notices).toContain(pins.packages.find(pkg => pkg.name === 'nloptr')!.sourceNote)
  })
})
