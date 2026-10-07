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
/** Small tolerance for decimal KDIGO comparisons after unit conversion.
 * Applied in the compared quantity's units (mg/dl or a dimensionless ratio). */
export const KDIGO_THRESHOLD_TOLERANCE = 1e-12
/** KDIGO AKI staging: peak/baseline ratio for stage 2 and stage 3, and the
 * absolute peak (mg/dl) that is stage 3 regardless of ratio. */
export const KDIGO_STAGE_2_RATIO = 2.0
export const KDIGO_STAGE_3_RATIO = 3.0
export const KDIGO_STAGE_3_ABSOLUTE_MGDL = 4.0

/** Serum creatinine µmol/l per mg/dl used by eGFR and AKI derivation. */
export const MGDL_PER_UMOLL = 88.42

/** Default rapid eGFR decline threshold (mL/min/1.73 m² per year). */
export const DEFAULT_RAPID_EGFR_DECLINE = 5
/** Default length of the AKI exclusion window after an episode onset (days). */
export const DEFAULT_AKI_EXCLUSION_DAYS = 30
/** Default minimum interval confirming an observed CKD G4/G5 event (days). */
export const DEFAULT_CONFIRMATION_DAYS = 90
/** Largest minimum confirmation interval (days). A confirming value must
 * follow within 12 calendar months (365 or 366 days), so a longer interval
 * could never confirm. */
export const MAX_CONFIRMATION_DAYS = 365
