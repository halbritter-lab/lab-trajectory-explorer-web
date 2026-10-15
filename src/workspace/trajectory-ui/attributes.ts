import { normalizedGroupValue } from './grouping'

const PREFIX = 'attribute:'
export const attributeSortKey = (attribute: string, ascending: boolean) => `${PREFIX}${JSON.stringify(attribute)}:${ascending ? 'asc' : 'desc'}`

export function parseAttributeSort(sort: string): { attribute: string; ascending: boolean } | null {
  if (!sort.startsWith(PREFIX)) return null
  const separator = sort.lastIndexOf(':')
  const direction = sort.slice(separator + 1)
  if (direction !== 'asc' && direction !== 'desc') return null
  try {
    const attribute: unknown = JSON.parse(sort.slice(PREFIX.length, separator))
    return typeof attribute === 'string' ? { attribute, ascending: direction === 'asc' } : null
  } catch { return null }
}

export function compareAttributeValues(a: string | null | undefined, b: string | null | undefined, ascending: boolean): number {
  const left = normalizedGroupValue(a), right = normalizedGroupValue(b)
  if (left === null) return right === null ? 0 : 1
  if (right === null) return -1
  return (ascending ? 1 : -1) * left.localeCompare(right, 'en', { numeric: true })
}
