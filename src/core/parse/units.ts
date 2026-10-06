/**
 * Comparison key for unit spellings. Two units with the same key differ only in
 * letter case, whitespace, or how the micro prefix is written (µ U+00B5, μ U+03BC
 * or a plain "u" before a unit letter, as in "umol/l" or "/ul"). Different units
 * keep different keys: nothing here converts mg/dl to µmol/l. A "u" that is not
 * followed by a letter is the enzyme unit U, as in "U/l", and is left alone.
 */
export function unitKey(unit: string): string {
  return unit
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/μ/g, 'µ')
    .replace(/(^|[^a-zµ])u(?=[a-z])/g, '$1µ')
}

export interface UnitHarmonisation {
  testName: string | null
  canonical: string
  /** Every spelling seen for this test name and unit key, with its row count,
   * in order of first appearance. */
  spellings: { unit: string; count: number }[]
}

/**
 * Pick one display spelling per (test name, unit key): the most frequent
 * spelling, ties going to the one seen first. Returns a lookup from
 * `[testName, unit]` to the canonical unit, plus one record per group that
 * actually had more than one spelling.
 */
export function planUnitHarmonisation(
  rows: readonly { bezeichnung: string | null; einheit: string | null }[],
): { canonicalFor: (testName: string | null, unit: string | null) => string | null; merged: UnitHarmonisation[] } {
  const groups = new Map<string, { testName: string | null; counts: Map<string, number> }>()
  for (const { bezeichnung, einheit } of rows) {
    if (einheit === null) continue
    const key = JSON.stringify([bezeichnung, unitKey(einheit)])
    let group = groups.get(key)
    if (!group) groups.set(key, (group = { testName: bezeichnung, counts: new Map() }))
    group.counts.set(einheit, (group.counts.get(einheit) ?? 0) + 1)
  }
  const canonical = new Map<string, string>()
  const merged: UnitHarmonisation[] = []
  for (const [key, group] of groups) {
    if (group.counts.size < 2) continue
    const spellings = [...group.counts].map(([unit, count]) => ({ unit, count }))
    const best = spellings.reduce((a, b) => (b.count > a.count ? b : a))
    canonical.set(key, best.unit)
    merged.push({ testName: group.testName, canonical: best.unit, spellings })
  }
  return {
    canonicalFor: (testName, unit) => (unit === null ? null : canonical.get(JSON.stringify([testName, unitKey(unit)])) ?? unit),
    merged,
  }
}
