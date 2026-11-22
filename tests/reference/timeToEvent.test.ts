import { describe, expect, it } from 'vitest'
import survival from './survival.json'
import extra from './time_to_event.json'
import { expectClose } from './tolerance'
import { aalenJohansen, kaplanMeier, logRankTest, type SurvivalSubject } from '../../src/core/survival/survival'

// The app's time-to-event estimators (issue #78) against native R survival:
// survival.json (survfit, survdiff, coxph score tests; survival 3.8-12) and
// time_to_event.json (medians by quantile.survfit, the delayed-entry log-rank
// of the app's r_script, cross-checked by survdiff, and the multi-state
// Aalen–Johansen estimate; survival 3.5-8, scripts/reference/time_to_event.R).
// Floating-point agreement only: the formulas are the same.
const TOL = { rel: 1e-10, abs: 1e-12 }

function subjectsByGroup(input: { time?: number[]; exit?: number[]; status: number[]; entry?: number[] | null; group?: string[] | null }) {
  const exits = input.exit ?? input.time!
  const groups = new Map<string, SurvivalSubject[]>()
  exits.forEach((exit, i) => {
    const label = input.group?.[i] ?? 'all'
    groups.set(label, [...(groups.get(label) ?? []), { entry: input.entry?.[i] ?? 0, exit, status: input.status[i] as 0 | 1 | 2 }])
  })
  return groups
}

describe(`Kaplan–Meier and log-rank against R survival ${survival.environment.packages.survival}`, () => {
  it.each(survival.cases)('$name', (c) => {
    const groups = subjectsByGroup(c.input)
    for (const table of c.survfit) {
      const km = kaplanMeier(groups.get(table.group)!)
      expect(km.steps.map(step => step.time), `${table.group} times`).toEqual(table.time)
      expect(km.steps.map(step => step.nRisk), `${table.group} at risk`).toEqual(table.nRisk)
      expect(km.steps.map(step => step.nEvent)).toEqual(table.nEvent)
      expect(km.steps.map(step => step.nCensor)).toEqual(table.nCensor)
      km.steps.forEach((step, row) => {
        const label = `${c.name} ${table.group} t=${step.time}`
        expectClose(step.survival, table.survival[row], TOL, `${label} S`)
        // survfit's std.err is the standard error of −log S, i.e. √V (Greenwood).
        expectClose(step.survival > 0 ? step.stdErr / step.survival : Number.NaN, table.stdErrLogSurvival[row], TOL, `${label} se`)
        // R gives the log-log limits as NA once S = 0; at S = 1 it gives 1 like the app.
        if (step.survival > 0) {
          expectClose(step.lower, table.lowerLogLog[row], TOL, `${label} lower`)
          expectClose(step.upper, table.upperLogLog[row], TOL, `${label} upper`)
        }
      })
    }
    if (!c.test) return
    const test = logRankTest([...groups].map(([label, subjects]) => ({ label, subjects })))
    if (c.test.logRank) {
      expectClose(test.chiSquare, c.test.logRank.chisq, TOL, 'survdiff chisq')
      expectClose(test.pValue, c.test.logRank.p, { rel: 1e-8, abs: 1e-12 }, 'survdiff p')
      expect(test.groups.map(group => group.observed)).toEqual(c.test.logRank.observed)
      test.groups.forEach((group, i) => expectClose(group.expected, c.test!.logRank!.expected[i], TOL, 'expected'))
    }
    // Without tied event times the hypergeometric variance is the Breslow score variance.
    const eventTimes = (c.input.time as number[]).filter((_, i) => c.input.status[i] === 1)
    if (new Set(eventTimes).size === eventTimes.length) expectClose(test.chiSquare, c.test.scoreBreslow.chisq, TOL, 'Breslow score chisq')
  })
})

describe(`median, delayed-entry log-rank and Aalen–Johansen against R survival ${extra.environment.survival}`, () => {
  it.each(extra.cases)('$name', (c) => {
    const groups = subjectsByGroup(c.input)
    for (const expected of c.medians) {
      const km = kaplanMeier(groups.get(expected.group)!)
      expect([km.median.estimate, km.median.lower, km.median.upper], `${c.name} ${expected.group} median`).toEqual([expected.median, expected.lower, expected.upper])
    }
    if ('logRank' in c && c.logRank) {
      const test = logRankTest([...groups].map(([label, subjects]) => ({ label, subjects })))
      expectClose(test.chiSquare, c.logRank.chisq, TOL, 'log-rank chisq')
      expectClose(test.pValue, c.logRank.p, { rel: 1e-8, abs: 1e-12 }, 'log-rank p')
      expect(test.df).toBe(c.logRank.df)
      test.groups.forEach((group, i) => expectClose(group.expected, c.logRank!.expected[i], TOL, 'expected'))
      if ('survdiffChisq' in c) expectClose(test.chiSquare, c.survdiffChisq as number, TOL, 'survdiff')
    }
    if ('aalenJohansen' in c && c.aalenJohansen) {
      const steps = aalenJohansen(groups.get('all')!)
      c.aalenJohansen.time.forEach((time, i) => {
        // The app reports steps at event times only; R also at censoring times (unchanged values).
        const step = [...steps].reverse().find(s => s.time <= time)
        expectClose(step?.endpoint ?? 0, c.aalenJohansen!.endpoint[i], TOL, `F1 t=${time}`)
        expectClose(step?.death ?? 0, c.aalenJohansen!.death[i], TOL, `F2 t=${time}`)
      })
    }
  })
})
