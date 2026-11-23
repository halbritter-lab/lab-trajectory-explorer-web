/**
 * Fixed texts the core modules give the interface (event effects, presets,
 * module settings, exclusion reasons …). The core keeps them in English for
 * the exports; listing them here puts them in the catalogs, so `tx()` shows
 * them translated. A core text that is not listed stays English.
 */
import { msg } from '../../i18n'

export const CORE_LABELS = [
  // Event effects (nephrology/censoring.ts)
  msg('display only in fits; ends follow-up for endpoints and time to event'),
  msg('display only'),
  msg('warning, not excluded from fit'),
  msg('censor from event date'),
  msg('censor from dialysis start, unknown intent without end date'),
  msg('censor from dialysis start under the policy “Dated interval, else from start” (CKD progression) or “Censor from start”; not excluded under the other policies (unknown intent without end date)'),
  msg('censor from dialysis start, unknown intent'),
  msg('censor from dialysis start'),
  msg('exclude dialysis interval, unknown intent'),
  msg('exclude dialysis interval'),
  // Presets and categories (analysis/fitConfig.ts, nephrology/fitConfig.ts)
  msg('Standard / General'),
  msg('Nephrology (CKD / AKI)'),
  msg('General exploration (unweighted OLS)'),
  msg('General exploration: global OLS per patient and parameter, unweighted individual measurements, censored from a kidney transplant or chronic dialysis start on, no AKI or dialysis-interval exclusions, and no time aggregation. Slopes are per year. Changing the axis affects the display, not the calculation.'),
  msg('Unweighted global OLS on all numeric measurements before kidney transplant or chronic dialysis, no time balancing.'),
  msg('Theil–Sen robust trend (outlier resistant)'),
  msg('Theil–Sen: non-parametric median slope, unweighted, resistant to outliers; censored from a kidney transplant or chronic dialysis start on.'),
  msg('Non-parametric median slope; resistant to outliers, unweighted, censored from a kidney transplant or chronic dialysis start on.'),
  msg('CKD progression (quarterly medians, censoring, AKI exclusion)'),
  msg('CKD progression: quarterly medians, censored after transplant and chronic dialysis, AKI exclusion from onset to 90 days after the episode end (30 days from onset where the fit would keep fewer than 3 dates over 365 days), OLS display trend. Endpoints use exact measurements before kidney replacement therapy and outside dated acute dialysis intervals; the decline baseline also leaves out the AKI windows. The extrapolation to CKD G5 is off; switched on, it also leaves them out.'),
  msg('Quarterly medians, censored after transplant and chronic dialysis, AKI exclusion to 90 days after the episode end (30 days from onset where too few values would remain), G4/G5 endpoints on eligible exact eGFR data, OLS trend.'),
  msg('Acute review (day-level raw points, no fit)'),
  msg('Acute review: day-level measurements without trend fit, focusing on KDIGO AKI.'),
  msg('Day-level raw measurements without trend fit, focusing on KDIGO AKI episodes.'),
  msg('General exploration'), msg('Theil–Sen robust trend'), msg('CKD progression'), msg('Acute review'),
  // Analysis modules
  msg('CKD endpoints'),
  msg('Clinical event censoring'),
  msg('Merged series'),
  msg('Rapid eGFR decline'),
  msg('Rapid decline > (mL/min/1.73m²/year)'),
  msg('Censoring after kidney transplant or chronic dialysis and exclusion of dialysis intervals.'),
  msg('Computed eGFR series from serum creatinine (CKD-EPI 2021, CKD-EPI 2009, MDRD-4, EKFC 2021, or CKiD U25 and EKFC over the full age range; under 18 CKiD U25 with height, otherwise EKFC, by default).'),
  msg('Flags eGFR series declining faster than a threshold per year.'),
  msg('KDIGO acute kidney injury episodes detected on serum creatinine (mg/dl or µmol/l converted to mg/dl), outside dialysis.'),
  msg('Percent eGFR decline, observed CKD G4/G5 and the optional extrapolation of the fitted trend to CKD G5.'),
  msg('Series merged by an explicit mapping; the source series stay, each derived value names its source.'),
  // Exclusion reasons
  msg('AKI window'),
  msg('acute dialysis interval'),
  msg('dialysis of unknown intent'),
  msg('after dialysis start of unknown intent without end date'),
  msg('after chronic dialysis start'),
  msg('after kidney transplant'),
  msg('after kidney replacement therapy, fitted as a separate segment'),
  // Time-to-event endpoints and projection boundaries
  msg('Confirmed CKD G4 (eGFR below 30)'),
  msg('Confirmed CKD G5 (eGFR below 15)'),
  msg('Confirmed 40% eGFR decline'),
  msg('Confirmed 50% eGFR decline'),
  msg('Confirmed 57% eGFR decline'),
  msg('Kidney replacement therapy (kidney transplant or chronic dialysis)'),
  msg('G4 boundary'),
  msg('G5 boundary'),
  msg('Cohort slope summary (not a mixed model)'),
] as const
