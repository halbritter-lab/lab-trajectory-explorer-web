/**
 * The columns of the workbook's `cohort` sheet (`slopes` in a patient export):
 * their fixed order, and the text of the `columns` sheet that describes them.
 *
 * The order is part of the export format. A new column is appended at the end;
 * existing positions stay. `group` is always present and always last, so a
 * grouped and an ungrouped export have the same layout.
 */

import { GROUP_NOT_RECORDED } from './trajectory-ui/grouping'

export interface CohortSheetColumn {
  name: string
  /** `number` columns are written as empty cells when there is no value;
   * `text` and `date` (text `YYYY-MM-DD`) columns as empty text. */
  kind: 'number' | 'text' | 'date'
  meaning: string
  unit: string
  /** When the cell is empty. */
  empty: string
}

const VALUE_UNIT = 'unit of the parameter (column Unit)'
const SLOPE_UNIT = 'unit of the parameter per year (column slope_unit)'
const EGFR_UNIT = 'mL/min/1.73 m² (unit of the parameter)'
const DATE_UNIT = 'date (YYYY-MM-DD, UTC)'
const NO_SLOPE = 'no slope was estimated (see reason; fit_model none included)'
const NOT_ROLLING = 'slope_mode is not rolling'
const NO_PROJECTION = 'the extrapolation to CKD G5 is off for the column (the default)'

const text = (name: string, meaning: string, empty: string, unit = ''): CohortSheetColumn => ({ name, kind: 'text', meaning, unit, empty })
const number = (name: string, meaning: string, unit: string, empty: string): CohortSheetColumn => ({ name, kind: 'number', meaning, unit, empty })
const date = (name: string, meaning: string, empty: string): CohortSheetColumn => ({ name, kind: 'date', meaning, unit: DATE_UNIT, empty })

/** The six columns of one observed endpoint event: three dates, then three values. */
function eventColumns(prefix: string, event: string, recovery: string, empty: string): CohortSheetColumn[] {
  const emptyRecovery = `no recovery was recorded after a confirmed ${event}`
  return [
    date(`${prefix}_first_date`, `Date of the first measurement of the confirmed ${event}.`, empty),
    date(`${prefix}_confirmed_date`, `Date of the measurement that confirmed the ${event} after the confirmation interval.`, empty),
    date(`${prefix}_recovery_date`, `Date of the first later measurement ${recovery}.`, emptyRecovery),
    number(`${prefix}_first_value`, `eGFR at ${prefix}_first_date.`, EGFR_UNIT, empty),
    number(`${prefix}_confirmed_value`, `eGFR at ${prefix}_confirmed_date.`, EGFR_UNIT, empty),
    number(`${prefix}_recovery_value`, `eGFR at ${prefix}_recovery_date.`, EGFR_UNIT, emptyRecovery),
  ]
}

export const COHORT_SHEET_COLUMNS: readonly CohortSheetColumn[] = [
  text('PatientID', 'Patient identifier as imported.', 'never'),
  text('slope_mode', 'How the series is fitted and drawn: global, global-robust (Theil-Sen), rolling, gap-split (segmented OLS) or another path.', 'never'),
  text('fit_model', 'Estimator behind slope: ols, theil-sen or none.', 'never'),
  number('n', 'Dated numeric measurements of the series, bounds (<, >) included, before any exclusion or time balancing.', 'count', 'never; 0 without measurements'),
  number('span_days', 'Whole days between the first and the last of the measurements counted in n.', 'days', 'never; 0 with fewer than two'),
  number('slope', 'Slope of the trend per year, unrounded. For rolling and segmented OLS it is the global OLS slope.', SLOPE_UNIT, NO_SLOPE),
  text('slope_unit', 'Unit of slope: the parameter unit followed by /yr.', 'never'),
  number('r2', 'Coefficient of determination of the OLS fit; 1 for the exact two-point line.', 'none (0 to 1)', 'no slope was estimated, the estimator is Theil-Sen, or all fitted values are equal'),
  number('ci_low', 'Lower bound of the slope: 95 % interval for OLS; for Theil-Sen the rank-based bound, which is not a 95 % interval when n_fitted_dates is below 5.', SLOPE_UNIT, 'no slope was estimated, or the bound is undefined (exact two-point line)'),
  number('ci_high', 'Upper bound of the slope, as ci_low.', SLOPE_UNIT, 'as ci_low'),
  text('reason', 'Why no slope is given or why it is limited: no_numeric_values, n_below_threshold (also whenever fit_model is none) or span_too_short (raw span under 365 days; a slope is normally still given).', 'none of these applies'),
  text('unstable_slope', 'yes when the slope rests on fewer than three fitted measurement dates or on a fitted span under 365 days, or when a fit was selected and gave no slope.', 'the slope is not flagged, or fit_model is none'),
  text('demographics_conflict', 'yes when the patient\'s sex or birth date had to be resolved from contradictory input; the texts are in the demographics sheet.', 'no conflict was reported'),
  text('aki', 'AKI label of the cell, for example "AKI III": the highest stage among the detected episodes (KDIGO creatinine criterion, automated screening).', 'no episode was detected, or the parameter has no AKI screening'),
  text('rapid_progression', 'yes when the slope of an eGFR series and the upper bound of its 95 % interval are both below minus the column\'s threshold (settings sheet, rapid_egfr_threshold; 0 switches the flag off); possible when only the slope is below it, including a slope without a 95 % interval (for Theil-Sen below 5 fitted dates the bounds are not one). Blank when unstable_slope is yes.', 'the condition is not met'),
  number('endpoint_percent_change', 'Total eGFR change in percent from first_eligible_value to last_eligible_value: negative for a fall, positive for a rise. Not a rate per year and not a confirmed decline event.', '%', 'percent decline is not evaluated for the column, there is no eligible measurement, or the first value is zero or negative'),
  text('endpoint_observed_ckd_g5', 'yes when an eGFR below 15 was observed and confirmed after the confirmation interval.', 'not confirmed, or not evaluated'),
  number('endpoint_projected_age_to_ckd_g5', 'Age at which the fitted line of the endpoint fit reaches eGFR 15: a conditional extrapolation of the fitted trend, not a prognosis.', 'years of age', 'the extrapolation is off for the column (the default), or none is reported (see endpoint_prediction_reason)'),
  text('endpoint_observed_ckd_g4', 'yes when an eGFR below 30 was observed and confirmed after the confirmation interval.', 'not confirmed, or not evaluated'),
  number('endpoint_confirmation_days', 'Minimum interval between first and confirming measurement of an observed endpoint.', 'days', 'no endpoint that uses confirmation is evaluated for the column'),
  text('endpoint_input_policy', 'Fixed text naming the measurements the endpoints use.', 'no endpoint is evaluated for the column'),
  text('endpoint_kidney_failure_reached', 'yes when the patient has a kidney transplant or chronic dialysis event; reported for eGFR series whatever the endpoint settings.', 'no such event, or not an eGFR series'),
  text('endpoint_kidney_failure_type', 'kidney_transplant or chronic_dialysis: the first such event.', 'as endpoint_kidney_failure_reached'),
  date('endpoint_kidney_failure_date', 'Date of that event.', 'as endpoint_kidney_failure_reached'),
  text('endpoint_prediction_anchor', 'fitted curve: the projection starts from the fitted line.', `${NO_PROJECTION}, or kidney failure was reached`),
  text('endpoint_prediction_model', 'Estimator of the endpoint fit: ols, theil-sen or none.', `${NO_PROJECTION}, or kidney failure was reached`),
  text('endpoint_prediction_reason', 'Code of the reason why no projected age is reported.', `${NO_PROJECTION}, or an age is reported`),
  number('endpoint_prediction_slope_ci_low', 'Lower slope bound of the endpoint fit.', 'mL/min/1.73 m² per year', `${NO_PROJECTION}, or the bound is not finite`),
  number('endpoint_prediction_slope_ci_high', 'Upper slope bound of the endpoint fit.', 'mL/min/1.73 m² per year', `${NO_PROJECTION}, or the bound is not finite`),
  number('endpoint_prediction_max_years', 'Longest projection horizon after the last eligible measurement (fixed at 20).', 'years', NO_PROJECTION),
  ...eventColumns('endpoint_g4', 'observed CKD G4 (eGFR below 30)', 'of 30 or more', 'observed CKD G4 is not confirmed, or not evaluated'),
  ...eventColumns('endpoint_g5', 'observed CKD G5 (eGFR below 15)', 'of 15 or more', 'observed CKD G5 is not confirmed, or not evaluated'),
  number('endpoint_confirmation_max_months', 'Longest time after the first measurement within which a confirmation is accepted (fixed at 12).', 'months', 'as endpoint_confirmation_days'),
  number('endpoint_decline_baseline_value', 'Baseline eGFR of the 40 %, 50 % and 57 % decline events: the mean of the eligible values of the first 90 days.', EGFR_UNIT, 'percent decline is not evaluated for the column, or there is no eligible measurement'),
  text('endpoint_observed_decline_40', 'yes when a decline of at least 40 % from the baseline was observed and confirmed.', 'not confirmed, or not evaluated'),
  text('endpoint_observed_decline_57', 'yes when a decline of at least 57 % from the baseline was observed and confirmed.', 'not confirmed, or not evaluated'),
  ...eventColumns('endpoint_decline_40', '40 % decline', 'whose decline from the baseline is below 40 %', 'the 40 % decline is not confirmed, or not evaluated'),
  ...eventColumns('endpoint_decline_57', '57 % decline', 'whose decline from the baseline is below 57 %', 'the 57 % decline is not confirmed, or not evaluated'),
  text('endpoint_prediction_age_basis', 'Basis of the projected age: birth date or age in completed years.', 'no projected age is reported'),
  text('Parameter', 'Name of the parameter as imported, or the name of the computed eGFR series.', 'never'),
  text('Unit', 'Unit of the parameter as imported.', 'the parameter has no unit'),
  number('n_fitted', 'Points the fit used after exclusions and time balancing; one monthly or quarterly median counts as one point.', 'count', 'never; 0 when fit_model is none'),
  number('fitted_span_days', 'Whole days between the first and the last fitted point.', 'days', 'never; 0 with fewer than two fitted points'),
  number('rolling_window_days', 'Length of a rolling OLS window.', 'days', NOT_ROLLING),
  number('rolling_step_days', 'Step between the starts of two rolling windows.', 'days', NOT_ROLLING),
  number('rolling_windows', 'Number of fitted rolling windows.', 'count', NOT_ROLLING),
  number('rolling_slope_min', 'Smallest window slope.', SLOPE_UNIT, `${NOT_ROLLING}, or no window was fitted`),
  number('rolling_slope_max', 'Largest window slope.', SLOPE_UNIT, `${NOT_ROLLING}, or no window was fitted`),
  date('index_date', 'Date of the first fitted point: the time origin of the trend, at which intercept applies. Under time balancing it is the date that represents the first bin.', 'no point was fitted'),
  date('last_fitted_date', 'Date of the last fitted point.', 'no point was fitted'),
  date('first_eligible_date', 'Date of the first eligible measurement: an exact value (no < or >) before the first kidney transplant or chronic dialysis and outside acute dialysis intervals. Independent of the fit settings.', 'the series has no eligible measurement'),
  date('last_eligible_date', 'Date of the last eligible measurement, as first_eligible_date.', 'the series has no eligible measurement'),
  number('intercept', 'Fitted value of the trend at index_date, unrounded.', VALUE_UNIT, NO_SLOPE),
  number('slope_se', 'Standard error of the OLS slope.', SLOPE_UNIT, 'no slope was estimated, the estimator is Theil-Sen, or the line is the exact two-point line'),
  number('n_fitted_dates', 'Distinct calendar dates among the fitted points.', 'count', 'never; 0 when no point was fitted'),
  number('first_eligible_value', 'Measured value at first_eligible_date. Filled for every parameter and fit setting. It can differ from the first value the table or chart shows, which also counts bounds and values after transplantation or dialysis.', VALUE_UNIT, 'the series has no eligible measurement'),
  number('last_eligible_value', 'Measured value at last_eligible_date. It can differ from "latest" in the Trajectories table, which is the last dated numeric value of the series without these restrictions.', VALUE_UNIT, 'the series has no eligible measurement'),
  text('sex', 'Resolved sex of the patient as used in the analysis: m, w or d. The same value in every row of the patient.', 'no sex could be resolved'),
  number('baseline_age', 'Resolved age of the patient at the earliest dated measurement of any parameter (demographics sheet, baseline_age). The same value in every row of the patient; it is not the age at index_date.', 'completed years', 'no age is available'),
  text('egfr_formula_switch', 'Computed eGFR only (since 2026-11-22): each change of the eGFR equation that the fitted slope spans, as "CKiD U25 → CKD-EPI 2021 on 2024-03-02", several separated by "; ". A change lies in the span when the first value with the new equation is after index_date and on or before last_fitted_date. Equations do not agree at a change (Pottel 2019: a mean jump of 23 mL/min/1.73 m² from CKiD to CKD-EPI at 18 years), so part of the slope can come from the change of equation.', 'no slope, no change of equation within the fitted span, or not the computed eGFR'),
  // Appended 2026-11-22 (issue #73).
  number('n_bounded', 'Fitted points that are bounded values (<x, >x), entered as fit_config boundedValues says (limit: at x; half-limit: <x at x/2, >x at x). Under time balancing a monthly or quarterly median counts when its period holds a bound, whichever value is the median. 0 under exclude, where bounds enter no fit. The app warns when n_bounded is 20 % or more of n_fitted: substituted limits bias slopes when many values are bounded.', 'count', 'never; 0 when no bound was fitted'),
  // Appended 2026-11-22 before `group`, which stays last: the confirmed 50 % decline (issue #82) and the unconfirmed single value below 15 (`g5single`).
  text('endpoint_observed_decline_50', 'yes when a decline of at least 50 % from the baseline was observed and confirmed, by the rule of the 40 % and 57 % declines.', 'not confirmed, or not evaluated (the 50 % decline is off unless switched on)'),
  ...eventColumns('endpoint_decline_50', '50 % decline', 'whose decline from the baseline is below 50 %', 'the 50 % decline is not confirmed, or not evaluated'),
  text('endpoint_g5_single_value_unconfirmed', 'yes when no CKD G5 is confirmed and a measurement date has only values below 15 while the eligible dates directly before and after it (if any) do not, a conclusive bound >x with x at or above 15 counting as such a date: a single value below 15, unconfirmed (possible AKI). It is never an observed G5 and does not withhold the projection.', 'no such value, a confirmed G5, or neither observed G5 nor the projection is evaluated'),
  text('group', `Value of the attribute the table was grouped by when the file was exported. A patient without a value for the attribute has the text "${GROUP_NOT_RECORDED}", which cannot be told apart from an attribute value of the same text.`, 'the table was not grouped'),
]

export const COHORT_SHEET_HEADER: readonly string[] = COHORT_SHEET_COLUMNS.map((column) => column.name)

/** Rows of the `columns` sheet: one per column of the cohort sheet, in order. */
export function cohortColumnDirectoryRows(): { column: string; meaning: string; unit: string; empty_when: string }[] {
  return COHORT_SHEET_COLUMNS.map((column) => ({ column: column.name, meaning: column.meaning, unit: column.unit, empty_when: column.empty }))
}

/** One row of the cohort sheet in the fixed column order. Missing numbers
 * become `null`, which the workbook writer leaves as an empty cell; a key
 * the directory does not list is an error, so no column is exported without
 * a description and a position. */
export function cohortSheetRow(record: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const unknown = Object.keys(record).filter((key) => !COHORT_SHEET_HEADER.includes(key))
  if (unknown.length > 0) throw new Error(`Export column without a directory entry: ${unknown.join(', ')}`)
  return Object.fromEntries(COHORT_SHEET_COLUMNS.map((column) => {
    const value = record[column.name]
    if (column.kind === 'number') return [column.name, typeof value === 'number' && Number.isFinite(value) ? value : null]
    return [column.name, value ?? '']
  }))
}
