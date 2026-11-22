/**
 * Nephrology constants: KDIGO thresholds and the app's nephrology defaults.
 * The single place these numbers are written down; everything else imports
 * them. Changing a value here changes numeric output (see CLAUDE.md, "Numeric
 * core: deliberate changes only").
 */

const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

/** KDIGO CKD G-stage boundaries (eGFR, mL/min/1.73 m²). A stage is reached
 * strictly below its boundary. */
export const CKD_G4_EGFR_THRESHOLD = 30
export const CKD_G5_EGFR_THRESHOLD = 15

/** KDIGO AKI creatinine criteria (serum creatinine in mg/dl). */
export const KDIGO_ABSOLUTE_RISE_MGDL = 0.3
export const KDIGO_ABSOLUTE_WINDOW_MS = 48 * MS_PER_HOUR
export const KDIGO_RELATIVE_RISE_RATIO = 1.5
export const KDIGO_RELATIVE_WINDOW_MS = 7 * MS_PER_DAY
/** Default sustained reversal that separates two AKI episodes (ADQI 16,
 * decided 2026-11-21, issue #67): a crossing starts a new episode only when it
 * lies more than this after the first value of the open episode that was back
 * below the KDIGO criterion. Counted in calendar days like the 48-hour
 * criterion. The AKI module setting `recoveryHours` (dataset-level, decided
 * 2026-11-22) chooses another length. */
export const DEFAULT_AKI_RECOVERY_HOURS = 48
export const AKI_RECOVERY_WINDOW_MS = DEFAULT_AKI_RECOVERY_HOURS * MS_PER_HOUR
/** Longest recovery the Data page field accepts: 90 days, the end of acute
 * kidney disease in ADQI 16 (review of the combined branch, 2026-11-22). The
 * detector itself takes any length. */
export const MAX_AKI_RECOVERY_HOURS = 90 * 24
/** Look-back baseline of the first value of an admission (decided
 * 2026-11-22, KDIGO 2012 AKI ch. 2.4): the mean of the creatinine values 7 to
 * 365 calendar days before it, both bounds inclusive. */
export const AKI_LOOKBACK_MIN_DAYS = 7
export const AKI_LOOKBACK_MAX_DAYS = 365
/** An admission (proxy) begins with a value after more than seven days
 * without values only when a further value follows on one of this many
 * later calendar days, as during a hospital stay. A single value after a
 * gap, or several values of one date only, are not an admission. */
export const AKI_ADMISSION_FOLLOW_UP_DAYS = 2
/** Small tolerance for decimal KDIGO comparisons after unit conversion.
 * Applied in the compared quantity's units (mg/dl or a dimensionless ratio). */
export const KDIGO_THRESHOLD_TOLERANCE = 1e-12
/** KDIGO AKI staging: value/reference ratio for stage 2 and stage 3, and the
 * absolute peak (mg/dl) that is stage 3 regardless of ratio. */
export const KDIGO_STAGE_2_RATIO = 2.0
export const KDIGO_STAGE_3_RATIO = 3.0
export const KDIGO_STAGE_3_ABSOLUTE_MGDL = 4.0

/** Serum creatinine µmol/l per mg/dl used by eGFR and AKI derivation. */
export const MGDL_PER_UMOLL = 88.42

/** Plausibility warnings on the Data page (warning only, no value changes):
 * serum creatinine strictly above this value in mg/dl (µmol/l converted)... */
export const IMPLAUSIBLE_CREATININE_ABOVE_MGDL = 25
/** ...and computed eGFR strictly above this value in mL/min/1.73 m². */
export const IMPLAUSIBLE_EGFR_ABOVE = 200

/** Default rapid eGFR decline threshold (mL/min/1.73 m² per year). */
export const DEFAULT_RAPID_EGFR_DECLINE = 5
/** Length of the shorter AKI exclusion window, counted from the episode
 * onset (days): the fallback when the longer window would leave too few
 * values for a reliable fit (decided 2026-11-22, row `akiwin`). */
export const DEFAULT_AKI_EXCLUSION_DAYS = 30
/** Days after the last day of an AKI episode up to which its exclusion window
 * runs by default: acute kidney disease lasts up to 90 days (KDIGO 2024
 * Fig. 3; decided 2026-11-22, row `akiwin`). */
export const DEFAULT_AKI_DAYS_AFTER_END = 90
/** Default minimum interval confirming an observed CKD G4/G5 event (days). */
export const DEFAULT_CONFIRMATION_DAYS = 90
/** Largest minimum confirmation interval (days). A confirming value must
 * follow within 12 calendar months (365 or 366 days), so a longer interval
 * could never confirm. */
export const MAX_CONFIRMATION_DAYS = 365
/** Confirmation preset of the endpoint settings: 28 days, the ISN trial
 * definition (Levin 2020; decided 2026-11-22, issue #85). Unverified: the full
 * text of Levin 2020 was not checked. */
export const ISN_TRIAL_CONFIRMATION_DAYS = 28
/** The optional individual G5 extrapolation needs at least four measurements
 * (distinct dates) over at least three years: KDIGO 2012 CKD, rationale to
 * Rec 2.1.3, p. 66 (decided 2026-11-22, `minfu`). Three years are counted as
 * 36 UTC calendar months, inclusive of the anniversary day. */
export const KDIGO_PROJECTION_MIN_DATES = 4
export const KDIGO_PROJECTION_MIN_MONTHS = 36
/** Confirmed eGFR decline boundaries in percent of the baseline: 40 and 57
 * (since 2026-10-06) and 50 (decided 2026-11-22, issue #82), evaluated by one rule. */
export const DECLINE_THRESHOLDS = [40, 50, 57] as const
export type DeclineThreshold = typeof DECLINE_THRESHOLDS[number]
