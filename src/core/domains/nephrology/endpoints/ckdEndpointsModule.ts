import type { AnalysisModule, EndpointContext, ModuleExportCell, SeriesKey } from '../../../analysis/types'
import { excludesAkiWindows, type CkdEndpointConfig } from '../fitConfig'
import { isEgfrUnit } from '../analytes'
import { computeCkdEndpoints, type CkdEndpoints, type CkdEndpointSettings } from './ckdEndpoints'
import { projectionTargetPresets as renalProjectionTargets } from '../projectionPresets'
import { firstKidneyFailureEvent } from './endpointEventPolicy'

export const CKD_ENDPOINTS_MODULE_ID = 'ckdEndpoints'

const DISABLED: CkdEndpointSettings = {
  percentDecline: false,
  observedCkdG5: false,
  projectedAgeToCkdG5: false,
}

/** Endpoints configured by the column, for eGFR series only. */
function endpointSettingsFor(series: SeriesKey, endpoints?: Partial<CkdEndpointConfig>): CkdEndpointSettings {
  if (!isEgfrUnit(series.einheit)) return DISABLED
  return {
    percentDecline: endpoints?.percentDecline ?? false,
    observedCkdG4: endpoints?.observedCkdG4 ?? false,
    observedCkdG5: endpoints?.observedCkdG5 ?? false,
    projectedAgeToCkdG5: endpoints?.projectedAgeToCkdG5 ?? false,
    confirmationDays: endpoints?.confirmationDays,
    observedDecline50: endpoints?.observedDecline50 ?? false,
  }
}

const endpointDate = (date: Date | null): string => date?.toISOString().slice(0, 10) ?? ''
const observedEvaluated = (e: CkdEndpoints) => e.evaluated.observedCkdG4 || e.evaluated.observedCkdG5 || e.evaluated.percentDecline
// The projection evaluates an observed G5 with the same interval and window, also with that endpoint off.
const confirmationUsed = (e: CkdEndpoints) => observedEvaluated(e) || e.evaluated.projectedAgeToCkdG5
const anyEvaluated = (e: CkdEndpoints) => observedEvaluated(e) || e.evaluated.percentDecline || e.evaluated.projectedAgeToCkdG5
type Cell = ModuleExportCell<CkdEndpoints>
const ENDPOINT_INPUT_POLICY = 'dated exact numeric measurements before first kidney transplant/chronic dialysis; dated acute dialysis intervals excluded (inclusive); bounds excluded'
/** The six date and value columns of one confirmed decline event. */
function declineEventColumns(threshold: string, field: 'observedDecline40' | 'observedDecline50' | 'observedDecline57') {
  return [
    { key: `endpoint_decline_${threshold}_first_date`, value: (c: Cell) => endpointDate(c.endpoints[field].firstDate) },
    { key: `endpoint_decline_${threshold}_confirmed_date`, value: (c: Cell) => endpointDate(c.endpoints[field].confirmedDate) },
    { key: `endpoint_decline_${threshold}_recovery_date`, value: (c: Cell) => endpointDate(c.endpoints[field].recoveryDate) },
    { key: `endpoint_decline_${threshold}_first_value`, value: (c: Cell) => c.endpoints[field].firstValue ?? '' },
    { key: `endpoint_decline_${threshold}_confirmed_value`, value: (c: Cell) => c.endpoints[field].confirmedValue ?? '' },
    { key: `endpoint_decline_${threshold}_recovery_value`, value: (c: Cell) => c.endpoints[field].recoveryValue ?? '' },
  ]
}
/** Export text for the basis of a projected age; blank without a projection. */
const AGE_BASIS_LABELS = { birth_date: 'birth date', whole_years: 'age in completed years', none: '' } as const

/**
 * CKD endpoints of eGFR series (unit mL/min/1.73 m², see isEgfrUnit): total percent
 * decline, observed CKD G4 and G5 (threshold crossings confirmed after the
 * column's interval) and the projected age at G5 along the series' fitted
 * line. The column's fit configuration (`endpoints`) selects which are
 * evaluated; other series report every endpoint as not evaluated.
 */
export const ckdEndpointsModule = {
  id: 'ckdEndpoints' as const,
  label: 'CKD endpoints',
  description: 'Percent eGFR decline, observed CKD G4/G5 and the optional extrapolation of the fitted trend to CKD G5.',
  appliesTo: (series: SeriesKey) => isEgfrUnit(series.einheit),
  // The G4 and G5 boundaries as targets for eGFR mixed-model projections.
  projectionTargets: renalProjectionTargets,
  endpoints: (ctx: EndpointContext): CkdEndpoints => {
    const enabled = endpointSettingsFor(ctx.seriesKey, ctx.fitConfig?.endpoints)
    // Ages and the endpoint-only fit feed the G5 projection; skip both otherwise.
    const projecting = enabled.projectedAgeToCkdG5
    const kidneyFailureReached = ctx.hasSeriesMeasurements && isEgfrUnit(ctx.seriesKey.einheit) ? firstKidneyFailureEvent(ctx.events) : null
    const fit = projecting && !kidneyFailureReached ? ctx.fit() : { slope: Number.NaN, intercept: Number.NaN, ciLow: Number.NaN, ciHigh: Number.NaN }
    return computeCkdEndpoints({ points: ctx.points(projecting), fitPoints: ctx.fitPoints(projecting), slopePerYear: fit.slope, intercept: fit.intercept, slopeCiLow: fit.ciLow, slopeCiHigh: fit.ciHigh, enabled,
      kidneyFailureReached, ageBasis: ctx.ageBasis, fitModel: ctx.scalarFitModel,
      inputExcludesAkiWindows: excludesAkiWindows(ctx) })
  },
  // Column order is part of the export format: the first three predate the
  // others, which were appended so positional readers keep working.
  exportColumns: [
    // Total change with the sign the badge shows: negative for a fall. The
    // result field stays a decline (positive for a fall); `0 -` avoids -0.
    { key: 'endpoint_percent_change', value: (c: Cell) => c.endpoints.percentDecline.value === null ? '' : 0 - c.endpoints.percentDecline.value },
    { key: 'endpoint_observed_ckd_g5', value: (c: Cell) => c.endpoints.observedCkdG5.met ? 'yes' : '' },
    { key: 'endpoint_projected_age_to_ckd_g5', value: (c: Cell) => c.endpoints.projectedAgeToCkdG5.value ?? '' },
    { key: 'endpoint_observed_ckd_g4', value: (c: Cell) => c.endpoints.observedCkdG4.met ? 'yes' : '' },
    { key: 'endpoint_confirmation_days', value: (c: Cell) => confirmationUsed(c.endpoints) ? c.endpoints.confirmationDays : '' },
    { key: 'endpoint_input_policy', value: (c: Cell) => anyEvaluated(c.endpoints) ? `${ENDPOINT_INPUT_POLICY}${c.endpoints.inputExcludesAkiWindows ? '; AKI exclusion windows excluded from decline baseline and projection' : ''}` : '' },
    { key: 'endpoint_kidney_failure_reached', value: (c: Cell) => c.endpoints.kidneyFailureReached ? 'yes' : '' },
    { key: 'endpoint_kidney_failure_type', value: (c: Cell) => c.endpoints.kidneyFailureReached?.type ?? '' },
    { key: 'endpoint_kidney_failure_date', value: (c: Cell) => endpointDate(c.endpoints.kidneyFailureReached?.date ?? null) },
    { key: 'endpoint_prediction_anchor', value: (c: Cell) => c.endpoints.evaluated.projectedAgeToCkdG5 && !c.endpoints.kidneyFailureReached ? 'fitted curve' : '' },
    { key: 'endpoint_prediction_model', value: (c: Cell) => c.endpoints.evaluated.projectedAgeToCkdG5 && !c.endpoints.kidneyFailureReached ? c.fitModel : '' },
    { key: 'endpoint_prediction_reason', value: (c: Cell) => c.endpoints.evaluated.projectedAgeToCkdG5 ? c.endpoints.projectedAgeToCkdG5.reason ?? '' : '' },
    { key: 'endpoint_prediction_slope_ci_low', value: (c: Cell) => c.endpoints.evaluated.projectedAgeToCkdG5 ? c.endpoints.projectedAgeToCkdG5.slopeCiLow ?? '' : '' },
    { key: 'endpoint_prediction_slope_ci_high', value: (c: Cell) => c.endpoints.evaluated.projectedAgeToCkdG5 ? c.endpoints.projectedAgeToCkdG5.slopeCiHigh ?? '' : '' },
    { key: 'endpoint_prediction_max_years', value: (c: Cell) => c.endpoints.evaluated.projectedAgeToCkdG5 ? 20 : '' },
    { key: 'endpoint_g4_first_date', value: (c: Cell) => endpointDate(c.endpoints.observedCkdG4.firstDate) },
    { key: 'endpoint_g4_confirmed_date', value: (c: Cell) => endpointDate(c.endpoints.observedCkdG4.confirmedDate) },
    { key: 'endpoint_g4_recovery_date', value: (c: Cell) => endpointDate(c.endpoints.observedCkdG4.recoveryDate) },
    { key: 'endpoint_g4_first_value', value: (c: Cell) => c.endpoints.observedCkdG4.firstValue ?? '' },
    { key: 'endpoint_g4_confirmed_value', value: (c: Cell) => c.endpoints.observedCkdG4.confirmedValue ?? '' },
    { key: 'endpoint_g4_recovery_value', value: (c: Cell) => c.endpoints.observedCkdG4.recoveryValue ?? '' },
    { key: 'endpoint_g5_first_date', value: (c: Cell) => endpointDate(c.endpoints.observedCkdG5.firstDate) },
    { key: 'endpoint_g5_confirmed_date', value: (c: Cell) => endpointDate(c.endpoints.observedCkdG5.confirmedDate) },
    { key: 'endpoint_g5_recovery_date', value: (c: Cell) => endpointDate(c.endpoints.observedCkdG5.recoveryDate) },
    { key: 'endpoint_g5_first_value', value: (c: Cell) => c.endpoints.observedCkdG5.firstValue ?? '' },
    { key: 'endpoint_g5_confirmed_value', value: (c: Cell) => c.endpoints.observedCkdG5.confirmedValue ?? '' },
    { key: 'endpoint_g5_recovery_value', value: (c: Cell) => c.endpoints.observedCkdG5.recoveryValue ?? '' },
    { key: 'endpoint_confirmation_max_months', value: (c: Cell) => confirmationUsed(c.endpoints) ? 12 : '' },
    { key: 'endpoint_decline_baseline_value', value: (c: Cell) => c.endpoints.declineBaselineValue ?? '' },
    { key: 'endpoint_observed_decline_40', value: (c: Cell) => c.endpoints.observedDecline40.met ? 'yes' : '' },
    { key: 'endpoint_observed_decline_57', value: (c: Cell) => c.endpoints.observedDecline57.met ? 'yes' : '' },
    ...declineEventColumns('40', 'observedDecline40'),
    ...declineEventColumns('57', 'observedDecline57'),
    { key: 'endpoint_prediction_age_basis', value: (c: Cell) => AGE_BASIS_LABELS[c.endpoints.projectedAgeToCkdG5.ageBasis ?? 'none'] },
    // Appended 2026-11-22 (issue #82): the confirmed 50 % decline, same rule and block layout as 40 % and 57 %.
    { key: 'endpoint_observed_decline_50', value: (c: Cell) => c.endpoints.observedDecline50.met ? 'yes' : '' },
    ...declineEventColumns('50', 'observedDecline50'),
    // Appended 2026-11-22 (`g5single`): an unconfirmed single value below 15, never an observed G5.
    { key: 'endpoint_g5_single_value_unconfirmed', value: (c: Cell) => c.endpoints.g5SingleUnconfirmed ? 'yes' : '' },
  ],
} satisfies AnalysisModule<undefined, 'ckdEndpoints'>
