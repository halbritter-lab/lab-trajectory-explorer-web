import { describe, expect, it } from 'vitest'
import { findKdigoAkiEpisodes } from '../../../src/core/domains/nephrology/aki/kdigo'
import { akiExclusionWindows, episodesForSeries } from '../../../src/core/domains/nephrology/aki/akiAware'
import type { ClinicalEvent } from '../../../src/core/events/events'
import type { LabRow } from '../../../src/core/types'
import type { SeriesPoint } from '../../../src/core/stats/series'

// Episodes separated by 48 hours of recovery (ADQI 16), decided 2026-11-21 (issue #67),
// details of 2026-11-22. Dates are calendar days.
const HOUR = 3_600_000
const day = (n: number) => new Date(Date.UTC(2024, 0, 1 + n))
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null
const pts = (values: [number, number][]): SeriesPoint[] => values.map(([n, value]) => ({ date: day(n), value }))
const run = (values: [number, number][], options = {}) => findKdigoAkiEpisodes(pts(values), options)
const summary = (values: [number, number][], options = {}) => run(values, options).map((e) => [iso(e.date), e.stage, iso(e.endDate)])

describe('AKI episodes end after 48 hours back below the criterion', () => {
  it('keeps crossings without a value back below the criterion in one episode', () => {
    // Plateau: 1.3 on day 3 is compared with 1.0 of day 1 once day 0 has left the 48-hour window.
    // Until 2026-11-22 two stage-I episodes.
    expect(summary([[0, 1.0], [1, 1.0], [2, 1.3], [3, 1.3]])).toEqual([['2024-01-03', 1, null]])
  })

  it('continues an episode when the next crossing lies two calendar days after the value back below', () => {
    // Day 2: 1.0 does not cross. Day 4: 1.6 crosses against it (0.6 within 48 hours), 2 days later.
    expect(summary([[0, 1.0], [1, 1.6], [2, 1.0], [4, 1.6]])).toEqual([['2024-01-02', 1, null]])
  })

  it('starts a new episode when the next crossing lies three calendar days after it, and ends the first there', () => {
    // Day 5: 1.6 is 1.6 times the seven-day minimum 1.0, three days after the 1.0 of day 2.
    expect(summary([[0, 1.0], [1, 1.6], [2, 1.0], [5, 1.6]])).toEqual([['2024-01-02', 1, '2024-01-03'], ['2024-01-06', 1, null]])
  })

  it('ends an episode at its first value back below the criterion, also when later values follow', () => {
    expect(summary([[0, 1.0], [1, 1.6], [2, 1.2], [3, 1.1], [4, 1.0]])).toEqual([['2024-01-02', 1, '2024-01-03']])
  })

  it('counts calendar days, not hours, between the value back below and the next crossing', () => {
    const at = (n: number, hour: number, value: number): SeriesPoint => ({ date: day(n), timeOfDay: hour * HOUR, value })
    // 70 hours but two calendar days: one episode.
    const same = findKdigoAkiEpisodes([at(0, 6, 1.0), at(1, 6, 1.6), at(2, 1, 1.0), at(4, 23, 1.6)])
    expect(same.map((e) => [iso(e.date), iso(e.endDate)])).toEqual([['2024-01-02', null]])
    // 50 hours but three calendar days: two episodes.
    const split = findKdigoAkiEpisodes([at(0, 6, 1.0), at(1, 6, 1.6), at(2, 23, 1.0), at(5, 1, 1.6)])
    expect(split.map((e) => [iso(e.date), iso(e.endDate)])).toEqual([['2024-01-02', '2024-01-03'], ['2024-01-06', null]])
  })

  it('does not end an episode on a date whose values cannot be ordered and include a crossing', () => {
    // Day 3 holds 1.0 and 1.6 without a time of day: 1.6 crosses against 1.0 of day 0 (seven days),
    // so the date continues the episode, and only day 4 is back below the criterion.
    const values: SeriesPoint[] = [...pts([[0, 1.0], [1, 1.6]]), { date: day(3), value: 1.6 }, { date: day(3), value: 1.0 }, ...pts([[4, 1.2], [8, 1.9]])]
    expect(findKdigoAkiEpisodes(values).map((e) => [iso(e.date), iso(e.endDate)])).toEqual([['2024-01-02', '2024-01-05'], ['2024-01-09', null]])
  })

  it('takes the length of the recovery as an option', () => {
    const values: [number, number][] = [[0, 1.0], [1, 1.6], [2, 1.0], [4, 1.6]]
    expect(summary(values, { recoveryMs: 24 * HOUR })).toEqual([['2024-01-02', 1, '2024-01-03'], ['2024-01-05', 1, null]])
    expect(summary(values, { recoveryMs: 48 * HOUR })).toEqual([['2024-01-02', 1, null]])
  })

  // Review of the combined branch, 2026-11-22: the gap ends the episode at an earlier candidate end.
  it('ends an episode at the value back below the criterion before a gap, with an end date', () => {
    expect(run([[0, 1.0], [1, 1.6], [2, 1.0], [20, 1.6]]).map((e) => [iso(e.date), iso(e.endDate), e.endedByGap])).toEqual([['2024-01-02', '2024-01-03', false]])
  })

  it('ends an open episode at the first value after a gap of more than seven days', () => {
    // Day 20 has no earlier value within seven days: detection starts afresh, the episode ends there
    // and the crossing on day 21 starts a new one although it follows one day later.
    expect(summary([[0, 1.0], [1, 1.6], [20, 1.0], [21, 1.6]])).toEqual([['2024-01-02', 1, '2024-01-21'], ['2024-01-22', 1, null]])
    // A gap of seven days keeps the reference, so the 48-hour rule applies.
    expect(summary([[0, 1.0], [1, 1.6], [8, 1.0], [9, 1.6]])).toEqual([['2024-01-02', 1, null]])
    expect(run([[0, 1.0], [1, 1.6], [20, 1.0], [21, 1.6]]).map((e) => [e.endedByGap, iso(e.lastValueDate)])).toEqual([[true, '2024-01-02'], [false, '2024-01-22']])
  })

  it('ends an episode on a plateau once the reference has caught up, not on a return to the earlier baseline', () => {
    // Review 2026-11-22: 3.0 from day 2 to day 12 is three times the baseline 1.0. On day 9 the 1.0 and
    // 2.0 of days 0 and 1 have left the 7-day window, the 7-day minimum is 3.0 and 3.0 meets no criterion:
    // the episode ends there. 4.6 on day 14 crosses against 3.0 and opens a new stage-III episode.
    const plateau: [number, number][] = [[0, 1.0], [1, 2.0], ...Array.from({ length: 11 }, (_, i): [number, number] => [2 + i, 3.0]), [14, 4.6]]
    expect(summary(plateau)).toEqual([['2024-01-02', 3, '2024-01-10'], ['2024-01-15', 3, null]])
  })

  it('keeps the onset and the configured length of the exclusion window for a merged episode', () => {
    const [episode] = run([[0, 1.0], [1, 1.4], [2, 1.8], [3, 2.2], [4, 2.6], [5, 3.0]])
    expect(akiExclusionWindows([episode], 30).map((w) => [iso(w.start), iso(w.end)])).toEqual([['2024-01-02', '2024-02-01']])
  })
})

describe('AKI episodes do not end in a dated acute dialysis interval', () => {
  const row = (n: number, value: number): LabRow => ({ patientId: 1, labDatum: day(n), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: String(value), wertNum: value,
    wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null }) as LabRow
  const dialysis = (p: Partial<ClinicalEvent>): ClinicalEvent => ({ patientId: 1, type: 'dialysis', date: day(3), endDate: day(4), intent: 'acute', title: 'CVVHDF', description: null, warning: '', ...p })
  const rows = [row(0, 1.0), row(1, 1.6), row(2, 1.0), row(6, 1.6)]
  const episodes = (events: ClinicalEvent[]) => episodesForSeries(rows, 1, 'Kreatinin', 'mg/dl', events).map((e) => [iso(e.date), iso(e.endDate)])

  it('separates the episodes without dialysis', () => {
    expect(episodes([])).toEqual([['2024-01-02', '2024-01-03'], ['2024-01-07', null]])
  })

  it('does not let a value end the episode when a day of its recovery lies in the interval', () => {
    expect(episodes([dialysis({})])).toEqual([['2024-01-02', null]])
    expect(episodes([dialysis({ date: day(4), endDate: day(5) })])).toEqual([['2024-01-02', null]])
  })

  it('ignores an interval after the recovery and acute dialysis without an end date', () => {
    // Acute dialysis without an end date removes no value (OD-14), so its days can show recovery.
    expect(episodes([dialysis({ date: day(5), endDate: day(5) })])).toEqual([['2024-01-02', '2024-01-03'], ['2024-01-07', null]])
    expect(episodes([dialysis({ endDate: null })])).toEqual([['2024-01-02', '2024-01-03'], ['2024-01-07', null]])
  })

  it('does not let a value end the episode when a chronic dialysis starts in its recovery window', () => {
    // Review 2026-11-22: 1.2 on day 2 is followed by chronic dialysis from day 3, whose values are left out.
    const chr = [row(0, 1.0), row(1, 1.6), row(2, 1.2)]
    const chronic = dialysis({ intent: 'chronic', endDate: null })
    expect(episodesForSeries(chr, 1, 'Kreatinin', 'mg/dl', [chronic]).map((e) => [iso(e.date), iso(e.endDate)])).toEqual([['2024-01-02', null]])
    expect(episodesForSeries(chr, 1, 'Kreatinin', 'mg/dl', [dialysis({ intent: 'chronic', date: day(5), endDate: null })]).map((e) => iso(e.endDate))).toEqual(['2024-01-03'])
  })

  it('continues an episode across a dated acute dialysis interval of more than seven days', () => {
    // Review 2026-11-22: CVVHDF 3 to 13 January removes every value, 4.0 on 14 January has no reference,
    // and 6.5 on 16 January crosses against it two days later. Until this change two stage-III episodes.
    const icu = [row(0, 1.0), row(1, 3.2), row(13, 4.0), row(14, 4.2), row(15, 6.5)]
    const cvvhdf = dialysis({ date: day(2), endDate: day(12) })
    expect(episodesForSeries(icu, 1, 'Kreatinin', 'mg/dl', [cvvhdf]).map((e) => [iso(e.date), e.stage, iso(e.endDate), e.endedByGap])).toEqual([['2024-01-02', 3, null, false]])
    // Without the interval the same values are a gap of more than seven days: detection starts afresh. Since
    // 2026-11-22 (row akifirst) 4.0 on 14 January begins an admission and is compared with the mean of 1.0 and
    // 3.2 (13 and 12 days before): 4.0 / 2.1 = 1.9, so the second episode starts on 14 January, not 16 January.
    expect(episodesForSeries(icu, 1, 'Kreatinin', 'mg/dl', []).map((e) => [iso(e.date), iso(e.endDate), e.endedByGap])).toEqual([['2024-01-02', '2024-01-14', true], ['2024-01-14', null, false]])
    expect(episodesForSeries(icu, 1, 'Kreatinin', 'mg/dl', [], 48, {}).map((e) => e.baselineSource)).toEqual(['window', 'lookback_mean'])
    // A short interval inside a longer gap leaves more than seven days without values: the gap still ends the episode.
    expect(episodesForSeries(icu, 1, 'Kreatinin', 'mg/dl', [dialysis({ date: day(2), endDate: day(4) })]).map((e) => iso(e.date))).toEqual(['2024-01-02', '2024-01-14'])
  })

  it('does not end an episode at the first value after a long acute interval, which has no reference', () => {
    // Review 2026-11-22: 4.0 on 14 January follows CVVHDF from 3 to 13 January and is compared with no
    // earlier value. Until this change it was the candidate end, so 7.0 three days later opened a second
    // stage-III episode. Now 4.1 on 15 January (against 4.0) is the candidate end and 7.0 joins.
    const cvvhdf = dialysis({ date: day(2), endDate: day(12) })
    const postdx = [row(0, 1.0), row(1, 3.2), row(13, 4.0), row(14, 4.1), row(15, 4.2), row(16, 7.0)]
    expect(episodesForSeries(postdx, 1, 'Kreatinin', 'mg/dl', [cvvhdf]).map((e) => [iso(e.date), e.stage, iso(e.endDate), iso(e.lastValueDate)])).toEqual([['2024-01-02', 3, null, '2024-01-17']])
    // A single value after the interval leaves the episode open at it.
    expect(episodesForSeries(postdx.slice(0, 3), 1, 'Kreatinin', 'mg/dl', [cvvhdf]).map((e) => [iso(e.endDate), e.endedByGap, iso(e.lastValueDate)])).toEqual([[null, false, '2024-01-14']])
  })
})
