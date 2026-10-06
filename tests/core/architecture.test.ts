import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

const coreRoot = resolve(process.cwd(), 'src/core')
const srcRoot = resolve(coreRoot, '..')
const genericDirectories = [
  'stats', 'fitPipeline', 'exclusions', 'endpoints',
  'projection', 'grouping', 'parse', 'demographics',
] as const
const forbiddenDirectories = new Set(['domains', 'analysis', 'events', 'io', 'workspace'])

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && ['.ts', '.tsx'].includes(extname(path)) ? [path] : []
  })
}

function importedModules(source: ts.SourceFile): string[] {
  const imports: string[] = []
  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text)
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) {
      imports.push(node.moduleReference.expression.text)
    } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      imports.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return imports
}

it('keeps generic core primitives free of domain, analysis, event, IO and workspace imports', () => {
  const violations: string[] = []
  for (const directory of genericDirectories) {
    for (const file of sourceFiles(join(coreRoot, directory))) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
      for (const specifier of importedModules(source)) {
        if (!specifier.startsWith('.')) continue
        const target = resolve(dirname(file), specifier)
        const parts = relative(srcRoot, target).split(sep)
        const importedLayer = parts[0] === 'core' ? parts[1] : parts[0]
        if (forbiddenDirectories.has(importedLayer)) {
          violations.push(`${relative(coreRoot, file)} imports ${specifier}`)
        }
      }
    }
  }
  expect(violations).toEqual([])
})
