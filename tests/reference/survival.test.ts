import { describe, expect, it } from 'vitest'
import reference from './survival.json'
import { expectClose } from './tolerance'

// survival.json holds Kaplan–Meier and log-rank results from the R package
// survival for the comparison in issue #78; the app has no Kaplan–Meier
// estimator yet. These checks keep the file usable: its schema, and that each
// table is the product-limit estimate of its own risk sets
// (docs/reference-comparisons.md).
const TOL = { rel: 1e-12, abs: 1e-14 }

describe(`Kaplan–Meier reference cases (survival ${reference.environment.packages.survival})`, () => {
  it.each(reference.cases)('$name', (c) => {
    const n = c.input.time.length
    expect(c.input.status).toHaveLength(n)
    if (c.input.entry) expect(c.input.entry).toHaveLength(n)
    if (c.input.group) expect(c.input.group).toHaveLength(n)
    const groups = c.input.group ? [...new Set(c.input.group)] : ['all']
    expect(c.survfit.map((table) => table.group)).toEqual(groups)
    for (const table of c.survfit) {
      const members = c.input.time.map((_, i) => i).filter((i) => !c.input.group || c.input.group[i] === table.group)
      let survival = 1
      table.time.forEach((time, row) => {
        // Risk set at time t: entry < t ≤ exit (entry 0 when absent).
        const atRisk = members.filter((i) => (c.input.entry?.[i] ?? 0) < time && c.input.time[i] >= time).length
        const events = members.filter((i) => c.input.time[i] === time && c.input.status[i] === 1).length
        expect(table.nRisk[row], `${table.group} t=${time} at risk`).toBe(atRisk)
        expect(table.nEvent[row], `${table.group} t=${time} events`).toBe(events)
        survival *= 1 - events / atRisk
        expectClose(table.survival[row], survival, TOL, `${table.group} t=${time} S(t)`)
      })
    }
    if (c.input.group) {
      expect(c.test!.scoreEfron.df).toBe(1)
      if (!c.input.entry) expect(c.test!.logRank!.chisq).toBeGreaterThan(0)
      else expect(c.test!.logRank).toBeNull()
    }
  })
})
