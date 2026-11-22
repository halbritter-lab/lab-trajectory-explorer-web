import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { LabRow } from '../../src/core/types'
import type { WorkspaceData } from '../../src/workspace/workspace-data'

// Every drawn measurement point formats its date for the tooltip, so the
// number of calls counts the points React builds in a render.
const formatted = vi.hoisted(() => ({ dates: 0 }))
vi.mock('../../src/core/format', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/core/format')>()
  return { ...original, formatDisplayDate: (date: Date) => { formatted.dates++; return original.formatDisplayDate(date) } }
})
const { TrajectoriesWorkspace } = await import('../../src/workspace/TrajectoriesWorkspace')
const { useAppStore } = await import('../../src/workspace/state/store')

if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) })
beforeEach(() => useAppStore.getState().reset())

it('rebuilds only the trajectories whose emphasis changes when the pointer moves (K24)', () => {
  const PATIENTS = 12, POINTS = 5
  const parameter = { key: JSON.stringify(['Marker', 'u']), label: 'Marker [u]', bezeichnung: 'Marker', einheit: 'u', derived: false }
  const rows: LabRow[] = Array.from({ length: PATIENTS }, (_, p) => Array.from({ length: POINTS }, (_, i): LabRow => ({ patientId: `P${p}`, labDatum: new Date(Date.UTC(2020 + i, 0, 1)), bezeichnung: 'Marker', einheit: 'u', wert: String(p + i), wertNum: p + i, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: 50 }))).flat()
  const data = { rawRows: rows, rows, fileName: 'hover.csv', parameters: [parameter], patients: Array.from({ length: PATIENTS }, (_, p) => ({ id: `P${p}`, label: `P${p}`, attributes: {}, baselineAge: 50 })), events: [], patientAttributes: {}, analysis: { fitInputs: [] }, analysisSettings: {}, manualDemographics: {} } as unknown as WorkspaceData
  render(<TrajectoriesWorkspace data={data} />)
  fireEvent.click(screen.getByRole('button', { name: 'Overlay' }))
  const people = [...document.querySelectorAll('svg.wt-plot .wt-chart-person')]
  expect(people).toHaveLength(PATIENTS)
  expect(document.querySelectorAll('svg.wt-plot circle')).toHaveLength(PATIENTS * POINTS)

  formatted.dates = 0
  fireEvent.mouseEnter(people[3])
  // One trajectory becomes emphasised; before, all twelve were rebuilt (60 points).
  expect(formatted.dates).toBe(POINTS)
  formatted.dates = 0
  fireEvent.mouseLeave(people[3])
  fireEvent.mouseEnter(people[4])
  expect(formatted.dates).toBe(2 * POINTS)
  expect(people[4].querySelector('polyline')).toHaveAttribute('stroke-width', '3')
  expect(people[3].querySelector('polyline')).toHaveAttribute('stroke-width', '1.5')
}, 20_000)
