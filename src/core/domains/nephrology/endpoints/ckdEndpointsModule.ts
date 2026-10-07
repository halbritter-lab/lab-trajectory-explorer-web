import type { AnalysisModule, EndpointContext, ModuleExportCell, SeriesKey } from '../../../analysis/types'
import type { CkdEndpointConfig } from '../fitConfig'
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
  }
}

const endpointDate = (date: Date | null): string => date?.toISOString().slice(0, 10) ?? ''
const observedEvaluated = (e: CkdEndpoints) => e.evaluated.observedCkdG4 || e.evaluated.observedCkdG5 || e.evaluated.percentDecline
const anyEvaluated = (e: CkdEndpoints) => observedEvaluated(e) || e.evaluated.percentDecline || e.evaluated.projectedAgeToCkdG5
type Cell = ModuleExportCell<CkdEndpoints>
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
  description: 'Percent eGFR decline, observed CKD G4/G5 and projected age at CKD G5.',
  appliesTo: (series: SeriesKey) => isEgfrUnit(series.einheit),
  // The G4 and G5 boundaries as targets for eGFR mixed-model projections.
  projectionTargets: renalProjectionTargets,
  endpoints: (ctx: EndpointContext): CkdEndpoints => {
    const enabled = endpointSettingsFor(ctx.seriesKey, ctx.fitConfig?.endpoints)
    // Ages and the endpoint-only fit feed the G5 projection; skip both otherwise.
    const projecting = enabled.projectedAgeToCkdG5
    const kidneyFailureReached = ctx.hasSeriesMeasurements && isEgfrUnit(ctx.seriesKey.einheit) ? firstKidneyFailureEvent(ctx.events) : null
    const fit = projecting && !kidneyFailureReached ? ctx.fit() : { slope: Number.NaN, intercept: Number.NaN, ciLow: Number.NaN, ciHigh: Number.NaN }
    return computeCkdEndpoints({ points: ctx.points(projecting), slopePerYear: fit.slope, intercept: fit.intercept, slopeCiLow: fit.ciLow, slopeCiHigh: fit.ciHigh, enabled,
      kidneyFailureReached, ageBasis: ctx.ageBasis })
  },
  // Column order is part of the export format: the first three predate the
  // others, which were appended so positional readers keep working.
  exportColumns: [
    { key: 'endpoint_percent_decline', value: (c: Cell) => c.endpoints.percentDecline.value ?? '' },
    { key: 'endpoint_observed_ckd_g5', value: (c: Cell) => c.endpoints.observedCkdG5.met ? 'yes' : '' },
    { key: 'endpoint_projected_age_to_ckd_g5', value: (c: Cell) => c.endpoints.projectedAgeToCkdG5.value ?? '' },
    { key: 'endpoint_observed_ckd_g4', value: (c: Cell) => c.endpoints.observedCkdG4.met ? 'yes' : '' },
    { key: 'endpoint_confirmation_days', value: (c: Cell) => observedEvaluated(c.endpoints) ? c.endpoints.confirmationDays : '' },
    { key: 'endpoint_input_policy', value: (c: Cell) => anyEvaluated(c.endpoints) ? 'dated exact numeric measurements before first kidney transplant/chronic dialysis; dated acute dialysis intervals excluded (inclusive); bounds excluded' : '' },
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
    { key: 'endpoint_confirmation_max_months', value: (c: Cell) => observedEvaluated(c.endpoints) ? 12 : '' },
    { key: 'endpoint_decline_baseline_value', value: (c: Cell) => c.endpoints.declineBaselineValue ?? '' },
    { key: 'endpoint_observed_decline_40', value: (c: Cell) => c.endpoints.observedDecline40.met ? 'yes' : '' },
    { key: 'endpoint_observed_decline_57', value: (c: Cell) => c.endpoints.observedDecline57.met ? 'yes' : '' },
    ...([['40', 'observedDecline40'], ['57', 'observedDecline57']] as const).flatMap(([threshold, field]) => [
      { key: `endpoint_decline_${threshold}_first_date`, value: (c: Cell) => endpointDate(c.endpoints[field].firstDate) },
      { key: `endpoint_decline_${threshold}_confirmed_date`, value: (c: Cell) => endpointDate(c.endpoints[field].confirmedDate) },
      { key: `endpoint_decline_${threshold}_recovery_date`, value: (c: Cell) => endpointDate(c.endpoints[field].recoveryDate) },
      { key: `endpoint_decline_${threshold}_first_value`, value: (c: Cell) => c.endpoints[field].firstValue ?? '' },
      { key: `endpoint_decline_${threshold}_confirmed_value`, value: (c: Cell) => c.endpoints[field].confirmedValue ?? '' },
      { key: `endpoint_decline_${threshold}_recovery_value`, value: (c: Cell) => c.endpoints[field].recoveryValue ?? '' },
    ]),
    { key: 'endpoint_prediction_age_basis', value: (c: Cell) => AGE_BASIS_LABELS[c.endpoints.projectedAgeToCkdG5.ageBasis ?? 'none'] },
  ],
} satisfies AnalysisModule<undefined, 'ckdEndpoints'>
