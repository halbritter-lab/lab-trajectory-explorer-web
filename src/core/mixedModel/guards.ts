/** Shared runtime guard for the mixed-model worker protocol and result
 * normalization. Excludes arrays so that an array value (e.g. a JSON array
 * where a named object was expected) is not mistaken for a record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
