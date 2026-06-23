import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '../../src/App'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'

function kreat(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2019-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: 'm', patientAgeAtLab: 50,
    ...p }
}

describe('eGFR + annotations wiring', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setDataset([
      kreat({ labDatum: new Date('2019-01-01'), wertNum: 1.0 }),
      kreat({ labDatum: new Date('2020-01-01'), wertNum: 1.4 }),
      kreat({ labDatum: new Date('2021-01-01'), wertNum: 1.8 }),
    ])
  })

  it('setEgfrFormula adds a computed eGFR series to the displayed rows', () => {
    useAppStore.getState().setEgfrFormula('ckd-epi-2021')
    const rows = useAppStore.getState().displayRows()
    expect(rows.some((r) => r.bezeichnung?.includes(', computed)'))).toBe(true)
  })

  it('uses the selected creatinine source and manual demographics for computed eGFR', () => {
    useAppStore.getState().setDataset([
      kreat({ bezeichnung: 'Kreatinin HP', einheit: 'mg/dl', wertNum: 1.0, patientSex: null, patientAgeAtLab: null }),
      kreat({ bezeichnung: 'Kreatinin HP', einheit: 'mg/dl', wertNum: 1.2, patientSex: null, patientAgeAtLab: null, labDatum: new Date('2020-01-01') }),
      kreat({ bezeichnung: 'Kreatinin UR', einheit: 'mg/dl', wertNum: 8.0, patientSex: 'm', patientAgeAtLab: 50 }),
    ])
    useAppStore.getState().setEgfrSource(['Kreatinin HP', 'mg/dl'])
    useAppStore.getState().setManualDemographics(1, { sex: 'm', age: 50 })
    useAppStore.getState().setEgfrFormula('ckd-epi-2021')
    const rows = useAppStore.getState().displayRows()
    const egfrRows = rows.filter((r) => r.bezeichnung?.includes(', computed)'))
    expect(egfrRows).toHaveLength(2)
    expect(egfrRows.every((r) => r.patientSex === 'm' && r.patientAgeAtLab === 50)).toBe(true)
  })

  it('renders the app with eGFR enabled without crashing', () => {
    useAppStore.getState().setEgfrFormula('ckd-epi-2021')
    render(<App />)
    expect(screen.getByText('Lab Trajectory Explorer')).toBeInTheDocument()
  })
})
