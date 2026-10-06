import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { WorkspaceAnalysisSettings } from '../../src/workspace/WorkspaceAnalysisSettings'
import { defaultFitSettings, endpointBadge, toFitConfig } from '../../src/workspace/workspace-analysis'
import { computeCkdEndpoints } from '../../src/core/domains/nephrology/endpoints/ckdEndpoints'
import { workspaceWorkbookBytes } from '../../src/workspace/workspace-export'
import { exportFixture } from './export-fixture'

const points = [14, 13, 20].map((value, i) => ({ date: new Date(['2020-01-01', '2020-02-01', '2020-05-01'][i]), value, ageYears: 60 + i/12 }))
function SettingsHarness() {
  const [settings, setSettings] = useState(defaultFitSettings('ckd_progression'))
  const config = toFitConfig(settings, { bezeichnung: 'eGFR', einheit: 'mL/min/1.73m²' })
  const endpoints = computeCkdEndpoints({ points, slopePerYear: 1, enabled: config.endpoints })
  return <><WorkspaceAnalysisSettings parameters={[]} sharedSettings={settings} overrides={{}} scope="" onScopeChange={() => {}} onChange={setSettings} onReset={() => {}} fitKeys={[]} onToggleFit={() => {}} /><output>{endpoints.observedCkdG5.met ? 'Confirmed' : 'Unconfirmed'}</output></>
}

describe('approved method settings and provenance', () => {
  it('shows raw percent change even when no prepared display fit exists', () => {
    const endpoints = computeCkdEndpoints({ points, slopePerYear: Number.NaN, enabled: { percentDecline: true, observedCkdG5: false, projectedAgeToCkdG5: false } })
    expect(endpointBadge(endpoints, points.length)?.label).toBe('+43%')
  })
  it('does not show a percent change for a single measurement', () => {
    const single = points.slice(0, 1)
    const endpoints = computeCkdEndpoints({ points: single, slopePerYear: Number.NaN, enabled: { percentDecline: true, observedCkdG5: false, projectedAgeToCkdG5: false } })
    expect(endpointBadge(endpoints, single.length)).toBeNull()
  })
  it('keeps a partly typed confirmation interval instead of snapping back to the default', () => {
    render(<SettingsHarness />)
    fireEvent.click(screen.getByText('Advanced pipeline settings'))
    const input = screen.getByLabelText('Minimum confirmation interval (days)')
    for (const value of ['9', '', '1', '18', '180']) fireEvent.change(input, { target: { value } })
    expect(input).toHaveValue(180)
    fireEvent.change(input, { target: { value: '' } })
    expect(input).toHaveValue(null)
    fireEvent.blur(input)
    expect(input).toHaveValue(180)
  })
  it('recalculates observed events when the minimum confirmation interval changes', () => {
    render(<SettingsHarness />)
    fireEvent.click(screen.getByText('Advanced pipeline settings'))
    expect(screen.getByLabelText('Observed CKD G4')).toBeChecked()
    expect(screen.getByLabelText('Minimum confirmation interval (days)')).toHaveValue(90)
    expect(screen.getByText('Unconfirmed')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Minimum confirmation interval (days)'), { target: { value: '30' } })
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })
  it('shows independent G4/G5 dates and subsequent recovery without losing the event', () => {
    const endpoints = computeCkdEndpoints({ points, slopePerYear: 1, enabled: { percentDecline: false, observedCkdG4: true, observedCkdG5: true, projectedAgeToCkdG5: false, confirmationDays: 30 } })
    const badge = endpointBadge(endpoints, points.length)!
    expect(badge.label).toContain('CKD G4')
    expect(badge.label).toContain('CKD G5')
    expect(badge.label).toContain('G5 recovery')
    expect(badge.title).toContain('event 2020-01-01')
    expect(badge.title).toContain('confirmed 2020-02-01')
    expect(badge.title).toContain('recovery 2020-05-01')
  })
  it('labels kidney failure separately from observed G5 and exports the KRT type and date', () => {
    const input = exportFixture()
    const endpoints = computeCkdEndpoints({ points, slopePerYear: 1, enabled: { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: true, confirmationDays: 30 }, kidneyFailureReached: { type: 'chronic_dialysis', date: new Date('2020-06-01') } })
    expect(endpoints.projectedAgeToCkdG5.reason).toBe('observed_ckd_g5')
    expect(endpointBadge(endpoints, points.length)?.label).toContain('Kidney failure reached')
    expect(endpointBadge(endpoints, points.length)?.title).toContain('chronic dialysis on 2020-06-01')
    input.cohortRows[0].cells[0].endpoints = endpoints
    const workbook = XLSX.read(workspaceWorkbookBytes(input), { type: 'array' })
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.cohort)
    expect(rows[0]).toMatchObject({ endpoint_observed_ckd_g5: 'yes', endpoint_kidney_failure_reached: 'yes', endpoint_kidney_failure_type: 'chronic_dialysis', endpoint_kidney_failure_date: '2020-06-01', endpoint_prediction_reason: 'observed_ckd_g5', endpoint_prediction_anchor: '', endpoint_prediction_model: '' })
  })
  it('withholds a future G5 projection after KRT with a neutral label and export reason', () => {
    const input = exportFixture()
    const endpoints = computeCkdEndpoints({ points: [
      { date: new Date('2020-01-01'), value: 60, ageYears: 60 },
      { date: new Date('2021-01-01'), value: 45, ageYears: 61 },
      { date: new Date('2022-01-01'), value: 30, ageYears: 62 },
    ], slopePerYear: -15, intercept: 60, enabled: { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: true }, kidneyFailureReached: { type: 'kidney_transplant', date: new Date('2022-06-01') } })
    expect(endpoints.projectedAgeToCkdG5).toEqual({ value: null, reason: 'kidney_failure_reached' })
    expect(endpointBadge(endpoints, 3)?.label).toContain('G5 not projected after KRT')
    input.cohortRows[0].cells[0].endpoints = endpoints
    const workbook = XLSX.read(workspaceWorkbookBytes(input), { type: 'array' })
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.cohort)
    expect(rows[0]).toMatchObject({ endpoint_kidney_failure_reached: 'yes', endpoint_prediction_reason: 'kidney_failure_reached' })
    expect(rows[0]).toMatchObject({ endpoint_projected_age_to_ckd_g5: '', endpoint_prediction_anchor: '', endpoint_prediction_model: '' })
  })
  it('exports event dates, recovery and effective settings in actual workbook bytes', () => {
    const input = exportFixture()
    input.cohortRows[0].cells[0].endpoints = computeCkdEndpoints({ points, slopePerYear: 1, enabled: { percentDecline: false, observedCkdG4: true, observedCkdG5: true, projectedAgeToCkdG5: true, confirmationDays: 30 } })
    const workbook = XLSX.read(workspaceWorkbookBytes(input), { type: 'array' })
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.cohort)
    expect(rows[0]).toMatchObject({ endpoint_observed_ckd_g4: 'yes', endpoint_observed_ckd_g5: 'yes', endpoint_g5_first_date: '2020-01-01', endpoint_g5_confirmed_date: '2020-02-01', endpoint_g5_recovery_date: '2020-05-01', endpoint_g5_recovery_value: 20, endpoint_confirmation_days: 30, endpoint_prediction_anchor: 'fitted curve', endpoint_input_policy: 'dated exact numeric measurements before first kidney transplant/chronic dialysis; dated acute dialysis intervals excluded (inclusive); bounds excluded' })
  })
  it('labels and exports both confirmed decline endpoints with baseline and recovery provenance', () => {
    const declinePoints = [
      ['2020-01-01', 100], ['2020-04-01', 60], ['2020-07-01', 60],
      ['2020-08-01', 43], ['2020-11-01', 43], ['2020-12-01', 61],
    ].map(([date, value]) => ({ date: new Date(`${date}T00:00:00Z`), value: Number(value), ageYears: null }))
    const endpoints = computeCkdEndpoints({ points: declinePoints, slopePerYear: -1, enabled: { percentDecline: true, observedCkdG5: false, projectedAgeToCkdG5: false } })
    const badge = endpointBadge(endpoints, declinePoints.length)!
    expect(badge.label).toContain('40% decline')
    expect(badge.label).toContain('57% decline')
    expect(badge.title).toContain('baseline 100')
    expect(badge.title).toContain('2020-12-01 (61)')
    const input = exportFixture()
    input.cohortRows[0].cells[0].endpoints = endpoints
    const workbook = XLSX.read(workspaceWorkbookBytes(input), { type: 'array' })
    const [row] = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.cohort)
    expect(row).toMatchObject({ endpoint_decline_baseline_value: 100, endpoint_observed_decline_40: 'yes', endpoint_decline_40_first_date: '2020-04-01', endpoint_decline_40_confirmed_date: '2020-07-01', endpoint_decline_40_first_value: 60, endpoint_decline_40_recovery_date: '2020-12-01', endpoint_observed_decline_57: 'yes', endpoint_decline_57_first_date: '2020-08-01', endpoint_decline_57_confirmed_date: '2020-11-01', endpoint_decline_57_recovery_value: 61, endpoint_confirmation_max_months: 12 })
  })
})
