/**
 * Owner decisions of 2026-11-22 on endpoints (issues #81, #82, #85, #4):
 * the extrapolation to CKD G5 off by default, the KDIGO minimum, the
 * unconfirmed single value below 15, the 28-day confirmation preset, the
 * confirmed 50 % decline and the choice of endpoint badges.
 */
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { computeCkdEndpoints, type EndpointPoint } from '../../src/core/domains/nephrology/endpoints/ckdEndpoints'
import { ckdEndpointsModule } from '../../src/core/domains/nephrology/endpoints/ckdEndpointsModule'
import { ckdProgressionConfig } from '../../src/core/domains/nephrology/fitConfig'
import { endpointBadge, ENDPOINT_BADGE_IDS, g5SingleUnconfirmedLabel } from '../../src/workspace/labels/endpointLabels'
import { defaultTrajectoryView, restoreSavedSettings, SAVED_SETTINGS_VERSION } from '../../src/workspace/saved-settings'
import { restoredNotice } from '../../src/workspace/workspace-storage'
import { defaultFitSettings } from '../../src/workspace/workspace-analysis'
import { EndpointSettings } from '../../src/workspace/trajectory-ui/EndpointSettings'
import { getMethodLocation } from '../../src/workspace/methods/method-navigation'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const point = (date: string, value: number, ageYears: number | null = null): EndpointPoint => ({ date: d(date), value, ageYears })
const EGFR = JSON.stringify(['eGFR', 'ml/min/1,73m²'])
const cell = (endpoints: ReturnType<typeof computeCkdEndpoints>) => Object.fromEntries(ckdEndpointsModule.exportColumns.map(column => [column.key, column.value({ flags: [], endpoints, fitModel: 'ols' })]))

describe('the extrapolation to CKD G5 is off by default (issue #81)', () => {
  it('is off in CKD progression, while the observed endpoints stay on', () => {
    const { endpoints } = ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' })
    expect(endpoints).toEqual({ percentDecline: true, observedCkdG4: true, observedCkdG5: true, confirmationDays: 90, projectedAgeToCkdG5: false })
  })
  it('leaves its export columns empty while off', () => {
    const points = [60, 50, 40, 30].map((value, i) => point(`${2020 + i}-01-01`, value, 60 + i))
    const off = cell(computeCkdEndpoints({ points, slopePerYear: -10, intercept: 60, slopeCiLow: -12, slopeCiHigh: -8, enabled: ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }).endpoints }))
    for (const key of ['endpoint_projected_age_to_ckd_g5', 'endpoint_prediction_anchor', 'endpoint_prediction_model', 'endpoint_prediction_reason', 'endpoint_prediction_slope_ci_low', 'endpoint_prediction_slope_ci_high', 'endpoint_prediction_max_years', 'endpoint_prediction_age_basis']) expect(off[key], key).toBe('')
  })
  it('keeps a saved "on" and names it, also under the former preset', () => {
    const saved = { ...defaultFitSettings('ckd_progression'), endpoints: { ...defaultFitSettings('ckd_progression').endpoints, projectedAgeToCkdG5: true } }
    const restored = restoreSavedSettings({ version: SAVED_SETTINGS_VERSION, trajectoryFitSettings: { shared: defaultFitSettings(), columns: { [EGFR]: saved } }, trajectoryView: defaultTrajectoryView() }, new Set([EGFR]))
    expect(restored.trajectoryFitSettings.columns[EGFR].endpoints.projectedAgeToCkdG5).toBe(true)
    // The preset's definition changed, so the saved values are kept as custom.
    expect(restored.trajectoryFitSettings.columns[EGFR].presetId).toBe('custom')
    expect(restored.projectionOn).toEqual(['own settings of eGFR [ml/min/1,73m²]'])
    expect(restoredNotice(restored)).toContain('The extrapolation to CKD G5 is switched on in own settings of eGFR [ml/min/1,73m²], as saved: a conditional extrapolation of the fitted trend, not a prognosis.')
  })
  it('answers old links to the projection section', () => {
    expect(getMethodLocation('#methods/endpoints/prediction')).toEqual({ topic: 'endpoints', section: 'extrapolation' })
    expect(getMethodLocation('#methods/endpoints/extrapolation')).toEqual({ topic: 'endpoints', section: 'extrapolation' })
  })
})

describe('unconfirmed single value below 15 (g5single)', () => {
  it('labels the cell and fills the last export flag', () => {
    const endpoints = computeCkdEndpoints({ points: [point('2020-01-01', 25), point('2020-06-01', 12), point('2020-09-01', 24)], slopePerYear: -1, enabled: { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: false } })
    expect(endpoints.observedCkdG5.met).toBe(false)
    expect(endpointBadge(endpoints, 3)?.label).toBe(g5SingleUnconfirmedLabel())
    expect(g5SingleUnconfirmedLabel()).toBe('single value <15, unconfirmed (possible AKI)')
    expect(cell(endpoints).endpoint_g5_single_value_unconfirmed).toBe('yes')
    expect(ckdEndpointsModule.exportColumns.at(-1)!.key).toBe('endpoint_g5_single_value_unconfirmed')
  })
})

describe('confirmed 50 % decline (issue #82)', () => {
  it('exports its block and badge only when switched on', () => {
    const points = [point('2020-01-01', 100), point('2020-06-01', 49), point('2020-10-01', 48)]
    const on = computeCkdEndpoints({ points, slopePerYear: -1, enabled: { percentDecline: true, observedCkdG5: false, projectedAgeToCkdG5: false, observedDecline50: true } })
    expect(cell(on)).toMatchObject({ endpoint_observed_decline_50: 'yes', endpoint_decline_50_first_date: '2020-06-01', endpoint_decline_50_confirmed_date: '2020-10-01', endpoint_decline_50_first_value: 49, endpoint_decline_50_confirmed_value: 48, endpoint_decline_50_recovery_date: '' })
    expect(endpointBadge(on, 3)?.label).toBe('-52%, 40% decline, 50% decline')
    const off = computeCkdEndpoints({ points, slopePerYear: -1, enabled: { percentDecline: true, observedCkdG5: false, projectedAgeToCkdG5: false } })
    expect(cell(off).endpoint_observed_decline_50).toBe('')
    expect(endpointBadge(off, 3)?.label).toBe('-52%, 40% decline')
  })
})

describe('endpoint badges are chosen in the view (badges)', () => {
  const points = [point('2020-01-01', 100), point('2020-06-01', 49), point('2020-10-01', 48)]
  const endpoints = computeCkdEndpoints({ points, slopePerYear: -1, enabled: { percentDecline: true, observedCkdG5: false, projectedAgeToCkdG5: false, observedDecline50: true } })
  it('leaves hidden badges out of label and detail; the export keeps them', () => {
    const shown = endpointBadge(endpoints, 3, new Set(['percentChange', 'decline40']))
    expect(shown?.label).toBe('50% decline')
    expect(shown?.title).not.toContain('40%')
    expect(endpointBadge(endpoints, 3, new Set(ENDPOINT_BADGE_IDS))).toBeNull()
    expect(cell(endpoints).endpoint_observed_decline_40).toBe('yes')
  })
  it('restores the choice with the view and drops an unknown badge list', () => {
    const view = { ...defaultTrajectoryView(), hiddenEndpointBadges: ['projection' as const, 'percentChange' as const] }
    const keep = restoreSavedSettings({ version: SAVED_SETTINGS_VERSION, trajectoryFitSettings: { shared: defaultFitSettings(), columns: {} }, trajectoryView: view }, new Set())
    expect(keep.trajectoryView.hiddenEndpointBadges).toEqual(['projection', 'percentChange'])
    expect(keep.notRestored).toEqual([])
    const bad = restoreSavedSettings({ version: SAVED_SETTINGS_VERSION, trajectoryFitSettings: { shared: defaultFitSettings(), columns: {} }, trajectoryView: { ...view, hiddenEndpointBadges: ['g6'] } }, new Set())
    expect(bad.trajectoryView.hiddenEndpointBadges).toBeUndefined()
    expect(bad.notRestored).toEqual(['endpoint badge choices'])
  })
})

describe('endpoint settings (issues #81, #82, #85)', () => {
  function Harness() {
    const [settings, setSettings] = useState(defaultFitSettings('ckd_progression'))
    return <><EndpointSettings settings={settings} onUpdate={patch => setSettings(previous => ({ ...previous, ...patch }))} /><output>{JSON.stringify(settings.endpoints)}</output></>
  }
  const endpoints = () => JSON.parse(screen.getByRole('status').textContent!) as Record<string, unknown>
  it('offers the 28-day ISN preset beside the 90-day default', () => {
    render(<Harness />)
    const select = screen.getByLabelText('Confirmation preset')
    expect([...select.querySelectorAll('option')].map(option => option.textContent)).toEqual(['90 days (default)', '28 days (ISN trial definition)'])
    fireEvent.change(select, { target: { value: '28' } })
    expect(endpoints().confirmationDays).toBe(28)
    expect(screen.getByLabelText('Minimum confirmation interval (days)')).toHaveValue(28)
    fireEvent.change(screen.getByLabelText('Minimum confirmation interval (days)'), { target: { value: '60' } })
    expect(select).toHaveValue('other')
  })
  it('switches the extrapolation and the 50 % decline on per parameter', () => {
    render(<Harness />)
    const extrapolation = screen.getByLabelText('Extrapolation to CKD G5')
    expect(extrapolation).not.toBeChecked()
    expect(screen.getByText(/a conditional extrapolation of the fitted trend, not a prognosis/)).toBeInTheDocument()
    fireEvent.click(extrapolation)
    expect(endpoints().projectedAgeToCkdG5).toBe(true)
    fireEvent.click(screen.getByLabelText('Confirmed 50% eGFR decline'))
    expect(endpoints().observedDecline50).toBe(true)
    fireEvent.click(screen.getByLabelText('Percent eGFR decline'))
    expect(screen.getByLabelText('Confirmed 50% eGFR decline')).toBeDisabled()
  })
})
