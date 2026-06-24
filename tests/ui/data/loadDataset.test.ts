import { describe, it, expect } from 'vitest'
import { datasetFromArrayBuffer, loadBundledFixtureData } from '../../../src/ui/data/loadDataset'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { episodesForSeries } from '../../../src/core/aki/akiAware'
import { appendComputedEgfr, COMPUTED_BEZEICHNUNG_SUFFIX } from '../../../src/core/egfr/series'

const FIXTURE = resolve(__dirname, '../../../public/test_labs.xlsx')
const EVENTS = resolve(__dirname, '../../../public/test_events.csv')
const localDate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

describe('datasetFromArrayBuffer', () => {
  it('parses the bundled fixture into LabRows', () => {
    const buf = readFileSync(FIXTURE)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const rows = datasetFromArrayBuffer(ab)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).toHaveProperty('patientId')
    expect(rows[0]).toHaveProperty('wertNum')
  })

  it('contains richer synthetic AKI and GFR trajectories', () => {
    const buf = readFileSync(FIXTURE)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const rows = datasetFromArrayBuffer(ab)

    expect(rows.length).toBeGreaterThanOrEqual(180)
    expect([...new Set(rows.map((r) => r.patientId))]).toEqual(expect.arrayContaining([7, 8, 9, 10, 11, 12, 13, 14]))
    const patientsWithDemographics = new Set(
      rows
        .filter((r) => r.patientSex !== null && r.patientAgeAtLab !== null)
        .map((r) => r.patientId),
    )
    expect(patientsWithDemographics.size).toBeGreaterThanOrEqual(10)
    expect(patientsWithDemographics.has(5)).toBe(false)

    const patient7Episodes = episodesForSeries(rows, 7, 'Kreatinin', 'mg/dl')
    expect(patient7Episodes.map((e) => e.stage)).toEqual([1, 2, 3])

    const patient12Episodes = episodesForSeries(rows, 12, 'Kreatinin', 'mg/dl')
    expect(patient12Episodes.map((e) => e.stage)).toEqual([1, 1, 2])

    const patient8Episodes = episodesForSeries(rows, 8, 'Kreatinin', 'mg/dl')
    expect(patient8Episodes).toHaveLength(0)

    const patient9 = rows.filter((r) => r.patientId === 9)
    const patient9Computed = appendComputedEgfr(patient9, { formula: 'ckd-epi-2021' })
      .filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))
      .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    expect(patient9Computed.length).toBeGreaterThanOrEqual(8)
    expect(patient9Computed[0].wertNum as number).toBeGreaterThan(patient9Computed.at(-1)!.wertNum as number)

    const patient10 = rows.filter((r) => r.patientId === 10)
    const patient10Computed = appendComputedEgfr(patient10, { formula: 'ekfc-2021', source: ['Kreatinin', 'µmol/l'] })
      .filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))
    expect(patient10Computed.length).toBeGreaterThanOrEqual(5)

    const patient13Egfr = rows
      .filter((r) => r.patientId === 13 && r.bezeichnung === 'eGFR')
      .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    expect(patient13Egfr.length).toBeGreaterThanOrEqual(9)
    expect(patient13Egfr.filter((r) => r.labDatum! < localDate('2022-07-01')).map((r) => r.wertNum)).toEqual([
      55,
      48,
      42,
      35,
      29,
      24,
    ])
    expect(patient13Egfr.filter((r) => r.labDatum! > localDate('2022-07-01')).map((r) => r.wertNum)).toEqual([72, 68, 64])

    const patient14March2021 = rows
      .filter((r) => r.patientId === 14 && r.bezeichnung === 'eGFR' && r.labDatum?.getFullYear() === 2021 && r.labDatum.getMonth() === 2)
      .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    expect(patient14March2021.map((r) => r.labDatum?.toISOString().slice(0, 10))).toEqual(['2021-03-05', '2021-03-20'])
    expect(patient14March2021.map((r) => r.wertNum)).toEqual([30, 80])
  })
})

describe('loadBundledFixtureData', () => {
  it('loads validated dialysis and transplant demo events with the bundled fixture', async () => {
    const labBytes = readFileSync(FIXTURE)
    const eventBytes = readFileSync(EVENTS)
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.endsWith('test_events.csv') ? eventBytes : labBytes
      return new Response(body)
    }
    try {
      const { rows, events } = await loadBundledFixtureData('/')

      expect(rows.length).toBeGreaterThanOrEqual(180)
      expect(events.map((event) => event.title)).toEqual(expect.arrayContaining(['Dialysis start', 'Kidney transplant']))
      expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(['dialysis', 'kidney_transplant']))
      expect(events.map((event) => event.patientId)).toEqual(expect.arrayContaining([7, 9, 10, 12, 13, 14]))
      expect(events.filter((event) => event.type === 'kidney_transplant').map((event) => event.patientId)).toEqual([10, 13, 14])
      expect(events.filter((event) => event.type === 'dialysis').map((event) => event.intent)).toEqual([
        'chronic',
        'acute',
        'unknown',
        'chronic',
      ])
      expect(events.map((event) => event.title)).toEqual(expect.arrayContaining(['Temporary dialysis during AKI', 'Unknown dialysis interval', 'Study medication']))
      expect(events.some((event) => event.warning === 'unknown_dialysis_intent')).toBe(true)
      expect(events).toHaveLength(8)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
