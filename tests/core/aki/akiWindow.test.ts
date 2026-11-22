import { describe, expect, it } from 'vitest'
import { akiEpisodeEndWindows, chooseAkiWindows, akiExclusionWindows } from '../../../src/core/domains/nephrology/aki/akiAware'
import { episodeLastDay, findKdigoAkiEpisodes } from '../../../src/core/domains/nephrology/aki/kdigo'
import { buildCohortRows, cohortExportRecords } from '../../../src/core/cohort/screening'
import { ckdProgressionConfig } from '../../../src/core/domains/nephrology/fitConfig'
import { generalExplorationConfig } from '../../../src/core/analysis/fitConfig'
import type { LabRow } from '../../../src/core/types'

// AKI exclusion window to 90 days after the episode end, else 30 days from the onset
// (decided 2026-11-22, row akiwin, issue #4).
const DAY = 86_400_000
const t0 = Date.UTC(2020, 0, 1)
const at = (day: number) => new Date(t0 + day * DAY)
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null
const crea = { bezeichnung: 'Kreatinin', einheit: 'mg/dl' }
const row = (day: number, value: number): LabRow => ({ patientId: 1, labDatum: at(day), ...crea, wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null })

describe('last day of an episode', () => {
  it('is the end date when one was observed, else the recovery window of the last value', () => {
    // Observed end: 1.0, 1.6, 1.0 on days 0 to 2, nothing crosses on days 3 and 4.
    const [ended] = findKdigoAkiEpisodes([1.0, 1.6, 1.0, 1.0, 1.0].map((value, day) => ({ date: at(day), value })))
    expect(iso(episodeLastDay(ended))).toBe('2020-01-03')
    // Open at the last value: 1.0, 1.6, 2.1 on days 0 to 2; two calendar days after the last value.
    const [open] = findKdigoAkiEpisodes([1.0, 1.6, 2.1].map((value, day) => ({ date: at(day), value })))
    expect(open.endDate).toBeNull()
    expect(iso(episodeLastDay(open))).toBe('2020-01-05')
    // Ended by a gap: the last value of the episode, not the value after the gap.
    const [gap] = findKdigoAkiEpisodes([{ date: at(0), value: 1.0 }, { date: at(1), value: 1.6 }, { date: at(40), value: 1.0 }])
    expect(gap.endedByGap).toBe(true)
    expect(iso(episodeLastDay(gap))).toBe('2020-01-04')
    expect(iso(episodeLastDay(gap, 0))).toBe('2020-01-02')
  })

  it('gives windows from the onset to 90 days after it, both bounds inclusive', () => {
    const episodes = findKdigoAkiEpisodes([1.0, 1.6, 1.0, 1.0, 1.0].map((value, day) => ({ date: at(day), value })))
    const [window] = akiEpisodeEndWindows(episodes, 90)
    expect([iso(window.start), iso(window.end)]).toEqual(['2020-01-02', '2020-04-02'])
    // The onset-based window of 30 days.
    expect(akiExclusionWindows(episodes, 30).map((w) => iso(w.end))).toEqual(['2020-02-01'])
  })
})

describe('choice between the longer and the shorter window', () => {
  const short = (start: Date) => [{ reason: 'aki' as const, start, end: new Date(start.getTime() + 30 * DAY) }]
  const long = (start: Date, end: Date) => [{ reason: 'aki' as const, start, end }]

  it('keeps the longer window when 3 fitted dates over at least 365 days remain', () => {
    const points = [0, 100, 200, 300, 400, 465].map((day) => ({ date: at(day), value: 1 }))
    const chosen = chooseAkiWindows(points, [], long(at(100), at(299)), short(at(100)))
    expect(chosen).toMatchObject({ rule: 'episode_end', longFittedDates: 4, longFittedSpanDays: 465 })
    // A span of 364 days is too short: the shorter window applies.
    const shortSpan = [0, 100, 200, 364].map((day) => ({ date: at(day), value: 1 }))
    expect(chooseAkiWindows(shortSpan, [], long(at(100), at(199)), short(at(100)))).toMatchObject({ rule: 'onset_fallback', longFittedDates: 3, longFittedSpanDays: 364 })
    expect(chooseAkiWindows([...shortSpan, { date: at(365), value: 1 }], [], long(at(100), at(199)), short(at(100))).rule).toBe('episode_end')
  })

  it('counts the fitted points after censoring and time balancing', () => {
    // Monthly values for two years; the longer window removes months 3 to 20.
    const points = Array.from({ length: 24 }, (_, m) => ({ date: new Date(Date.UTC(2020, m, 1)), value: 1 }))
    const windows = long(new Date(Date.UTC(2020, 2, 1)), new Date(Date.UTC(2021, 8, 1)))
    // Raw: four dates left (Jan, Feb 2020; Oct, Nov, Dec 2021 = five), span 700 days.
    expect(chooseAkiWindows(points, [], windows, short(windows[0].start)).rule).toBe('episode_end')
    // Censored from 2021-01-01: two dates left, the shorter window applies.
    expect(chooseAkiWindows(points, [{ start: new Date(Date.UTC(2021, 0, 1)), end: null }], windows, short(windows[0].start)).rule).toBe('onset_fallback')
    // Quarterly medians: 2020 Q1 and 2021 Q4 are two points.
    expect(chooseAkiWindows(points, [], windows, short(windows[0].start), 'quarterly-median')).toMatchObject({ rule: 'onset_fallback', longFittedDates: 2 })
  })

  it('keeps the longer rule without episodes', () => {
    expect(chooseAkiWindows([], [], [], [])).toMatchObject({ rule: 'episode_end', windows: [] })
  })
})

describe('cohort cells (CKD progression)', () => {
  // Creatinine every 60 days for three years, an episode on day 400 (1.1 -> 2.0 -> 1.2 on days 398 to 401).
  const base = Array.from({ length: 19 }, (_, i) => row(i * 60, 1.0 + i * 0.01)).filter((r) => r.labDatum!.getTime() < at(390).getTime() || r.labDatum!.getTime() > at(500).getTime())
  const rows = [...base, row(398, 1.1), row(400, 2.0), row(401, 1.2), row(410, 1.1), row(480, 1.1)]
    .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
  const cell = (config = ckdProgressionConfig(crea), data = rows) => buildCohortRows(data, [1], [{ ...crea, mode: 'global', fitConfig: config }])[0].cells[0]

  it('excludes from the onset to 90 days after the end and keeps every value before the onset', () => {
    const c = cell()
    const excluded = c.points.filter((_, i) => c.pointExclusionReasons[i].includes('aki')).map((p) => iso(p.date))
    // Onset 2021-02-04 (day 400), end 2021-02-05 (day 401), window to 2021-05-06 (day 491).
    expect(excluded).toEqual(['2021-02-04', '2021-02-05', '2021-02-14', '2021-04-25'])
    expect(c.points.some((p, i) => iso(p.date) === '2021-02-02' && c.pointExclusionReasons[i].length === 0)).toBe(true)
    expect(c.flags.map((f) => f.label)).toEqual(['AKI I'])
    const [record] = cohortExportRecords([{ patientId: 1, cells: [c] }])
    expect(record).toMatchObject({ aki: 'AKI I', aki_window: 'episode_end_plus_90d', n_aki_excluded: 4 })
  })

  it('follows the days after the end of the column and records them', () => {
    const config = ckdProgressionConfig(crea)
    config.exclusions = { ...config.exclusions, akiDaysAfterEnd: 0 }
    const c = cell(config)
    expect(c.points.filter((_, i) => c.pointExclusionReasons[i].includes('aki')).map((p) => iso(p.date))).toEqual(['2021-02-04', '2021-02-05'])
    expect(cohortExportRecords([{ patientId: 1, cells: [c] }])[0]).toMatchObject({ aki_window: 'episode_end_plus_0d', n_aki_excluded: 2 })
  })

  it('falls back to 30 days from the onset with a label when too few values would remain', () => {
    // Only the episode and two values before it: with the longer window one date remains.
    const few = [row(0, 1.0), row(398, 1.1), row(400, 2.0), row(401, 1.2), row(430, 1.1), row(470, 1.1)]
    const config = ckdProgressionConfig(crea)
    config.timeBalancing = 'raw'
    const c = cell(config, few)
    // Longer window (to day 491): days 0 and 398 remain, two dates. Shorter: day 400 to day 430, both inclusive.
    expect(c.points.filter((_, i) => c.pointExclusionReasons[i].includes('aki')).map((p) => iso(p.date))).toEqual(['2021-02-04', '2021-02-05', '2021-03-06'])
    const label = c.flags.find((f) => f.tone === 'aki-window')!
    expect(label.label).toBe('AKI window 30 d')
    expect(label.title).toBe('AKI windows shortened to 30 days after each onset: with windows up to 90 days after the end of each episode the fit would keep fewer than 3 fitted dates over at least 365 days.')
    expect(cohortExportRecords([{ patientId: 1, cells: [c] }])[0]).toMatchObject({ aki: 'AKI I', aki_window: 'onset_plus_30d_fallback', n_aki_excluded: 3 })
    // The band says so too.
    const band = c.overlays.find((o) => o.kind === 'band')!
    expect(band.kind === 'band' && band.legend).toBe(' Shaded: AKI window, the 30 days after each onset (shortened: with the window up to 90 days after the episode end the fit would keep fewer than 3 dates over 365 days); values inside are excluded from this fit')
  })

  it('writes no window values and no label for a column that keeps AKI windows', () => {
    const c = cell(generalExplorationConfig(crea))
    expect(c.pointExclusionReasons.every((r) => r.length === 0)).toBe(true)
    expect(cohortExportRecords([{ patientId: 1, cells: [c] }])[0]).toMatchObject({ aki_window: '', n_aki_excluded: '' })
    expect(c.flags.some((f) => f.tone === 'aki-window')).toBe(false)
  })
})
