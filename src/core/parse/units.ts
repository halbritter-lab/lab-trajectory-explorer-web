// Letters whose case changes meaning at the start of a unit token: SI prefixes
// (milli/mega, pico/peta, nano, kilo, giga, tera, exa, zepto/zetta, yocto/yotta)
// and the single-letter units they collide with (gram/giga, metre/molar,
// second/siemens, tonne/tera). Their case is kept; all other case is folded.
const CASE_SENSITIVE_FIRST = new Set([...'mMpPnNkKgGtTeEzZyYsS'])

/**
 * Comparison key for unit spellings. Two units with the same key differ only in
 * whitespace, how the micro prefix is written (µ U+00B5, μ U+03BC, or a plain
 * "u" before a unit letter, as in "umol/l" or "/ul"), or in letter case that
 * cannot change an SI prefix:
 * - within each letter run, the first letter keeps its case when it is one of
 *   the prefix-ambiguous letters (so mU/MU, pg/Pg and g/G stay apart) and the
 *   rest is folded (mg/dl = mg/dL, mmol/l = mmol/L, IU/l = iu/l);
 * - all-capitals spellings carry no case information, so their multi-letter
 *   runs are folded too (MG/DL = mg/dl). Single letters keep the rule above
 *   (G/L = G/l). One consequence: "MU/L" reads as milli-units, the usual meaning.
 * Different units keep different keys: nothing here converts mg/dl to µmol/l.
 * A "u" that is not followed by a letter is the enzyme unit U, as in "U/l".
 */
export function unitKey(unit: string): string {
  const s = unit.replace(/\s+/g, '').replace(/\u03bc/g, '\u00b5')
  const allCaps = !/[a-z]/.test(s)
  return s
    .replace(/[A-Za-z\u00b5]+/g, (run) => {
      if (allCaps && run.length > 1) return run.toLowerCase()
      const first = CASE_SENSITIVE_FIRST.has(run[0]) ? run[0] : run[0].toLowerCase()
      return first + run.slice(1).toLowerCase()
    })
    .replace(/(^|[^A-Za-z\u00b5])u(?=[A-Za-z])/g, '$1\u00b5')
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
 * spelling; ties go to a spelling with the micro sign µ, then to the one seen
 * first. Returns a lookup from
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
    // Most frequent spelling; on a tie the micro sign µ wins, then first seen.
    const rank = (x: { unit: string; count: number }) => x.count * 2 + (x.unit.includes('\u00b5') ? 1 : 0)
    const best = spellings.reduce((a, b) => (rank(b) > rank(a) ? b : a))
    canonical.set(key, best.unit)
    merged.push({ testName: group.testName, canonical: best.unit, spellings })
  }
  return {
    canonicalFor: (testName, unit) => (unit === null ? null : canonical.get(JSON.stringify([testName, unitKey(unit)])) ?? unit),
    merged,
  }
}
