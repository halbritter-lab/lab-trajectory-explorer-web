import { describe, expect, it } from 'vitest'
import { findKdigoAkiEpisodes, kdigoStage } from '../../src/core/domains/nephrology/aki/kdigo'
import type { SeriesPoint } from '../../src/core/stats/series'
import reference from './aki.json'

// KDIGO AKI staging against epocakir (issue #79, #34). Stages are integers:
// no tolerance. The definitions differ in places; each difference is asserted
// as it is, not aligned (docs/reference-comparisons.md).

describe(`KDIGO stage of one value against a baseline vs epocakir::aki_bCr (R ${reference.environment.R})`, () => {
  it.each(reference.cases.staging)('baseline $baselineMgdl, value $valueMgdl', ({ baselineMgdl, valueMgdl, epocakirStage }) => {
    const app = kdigoStage(baselineMgdl, valueMgdl)
    // aki_bCr grades by ratio and the value 4.0 only; the app also gives
    // stage 1 to a rise of at least 0.3 mg/dl below 1.5 times the baseline
    // (KDIGO's absolute criterion, which epocakir checks only within 48 hours
    // in aki_SCr).
    const absoluteOnly = valueMgdl - baselineMgdl >= 0.3 - 1e-12 && valueMgdl / baselineMgdl < 1.5 - 1e-12 && valueMgdl < 4
    expect(app).toBe(absoluteOnly ? 1 : epocakirStage)
    if (absoluteOnly) expect(epocakirStage).toBe(0)
  })
})

function points(series: (typeof reference.cases.series)[number]): SeriesPoint[] {
  return series.points.map(({ datetime, valueMgdl }) => {
    const at = new Date(datetime)
    const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
    const timeOfDay = at.getTime() - day.getTime()
    return { date: day, value: valueMgdl, ...(timeOfDay ? { timeOfDay } : {}) }
  })
}

describe('KDIGO AKI series vs epocakir::aki_SCr and aki_bCr', () => {
  it.each(reference.cases.series)('$name ($comparison)', (series) => {
    const episodes = findKdigoAkiEpisodes(points(series))
    const appStage = Math.max(0, ...episodes.map((e) => e.stage))
    const bySCr = series.epocakirStageBySCr === null ? 0 : Math.max(...series.epocakirStageBySCr)
    const byBaseline = series.epocakirStageByBaseline === null ? null : Math.max(...series.epocakirStageByBaseline)
    switch (series.comparison) {
      case 'match': {
        expect(series.epocakirError).toBeNull()
        expect(appStage).toBe(bySCr)
        const first = series.epocakirStageBySCr!.findIndex((stage) => stage > 0)
        expect(episodes[0]?.date.getTime() ?? null).toBe(first < 0 ? null : points(series)[first].date.getTime())
        break
      }
      case 'difference: 48-hour boundary':
        // Two values on calendar days two days apart: the app's 48-hour
        // window holds them (dates are calendar days), epocakir's is strictly
        // under 48 hours (and aki_SCr stops when no pair is closer).
        expect(appStage).toBe(1)
        expect(bySCr).toBe(0)
        break
      case 'difference: 7-day criterion needs a baseline in epocakir':
      case 'difference: staging without a baseline':
      case 'difference: stage 3 by value 4.0':
        // aki_SCr alone finds no rise of 1.5 times and no stage above 1 (its
        // stage 3 needs a rise of 4 mg/dl); with the seven-day minimum as the
        // baseline, aki_bCr gives the app's stage.
        expect(appStage).toBeGreaterThan(bySCr)
        expect(appStage).toBe(byBaseline)
        break
      default:
        throw new Error(`Unknown comparison ${series.comparison}`)
    }
  })
})
