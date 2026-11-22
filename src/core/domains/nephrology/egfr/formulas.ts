import type { Sex } from '../../../types'
import { normaliseSex } from '../../../demographics/sex'

export interface EgfrInput {
  scrMgdl: number
  ageYears: number
  sex: Sex | string | null
}

/** Input of the height-based paediatric equations (CKiD U25, bedside Schwartz). */
export interface HeightEgfrInput extends EgfrInput {
  heightCm: number
}

export { normaliseSex, isUnrecognisedSex } from '../../../demographics/sex'

function invalid(scr: number, age: number, s: Sex | null, minAge = 18): boolean {
  return s === null || !(scr > 0) || Number.isNaN(scr) || !(age >= minAge) || Number.isNaN(age)
}

/** Youngest age at which this app computes any eGFR (owner decision
 * 2026-11-21, issue #66: EKFC from age 2; below 2 no formula is used). */
export const MIN_PAEDIATRIC_EGFR_AGE = 2

/** CKD-EPI 2021 race-free creatinine equation (Inker 2021). ml/min/1.73m².
 * NaN for unknown sex / sub-adult age / non-positive creatinine. 'd' uses male
 * coefficients. Mirrors analyses/egfr.py:ckdepi_2021. */
export function ckdEpi2021({ scrMgdl, ageYears, sex }: EgfrInput): number {
  const s = normaliseSex(sex)
  if (invalid(scrMgdl, ageYears, s)) return Number.NaN
  let kappa: number, alpha: number, sexFactor: number
  if (s === 'w') { kappa = 0.7; alpha = -0.241; sexFactor = 1.012 }
  else { kappa = 0.9; alpha = -0.302; sexFactor = 1.0 } // m or d
  const ratio = scrMgdl / kappa
  return 142.0 * Math.min(ratio, 1.0) ** alpha * Math.max(ratio, 1.0) ** -1.2 * 0.9938 ** ageYears * sexFactor
}

/** CKD-EPI 2009 creatinine equation (Levey 2009). ml/min/1.73m².
 * The published race coefficient (x1.159) is not applied: the data model carries
 * no race. Same conditions as ckdEpi2021; 'd' uses male coefficients. */
export function ckdEpi2009({ scrMgdl, ageYears, sex }: EgfrInput): number {
  const s = normaliseSex(sex)
  if (invalid(scrMgdl, ageYears, s)) return Number.NaN
  let kappa: number, alpha: number, sexFactor: number
  if (s === 'w') { kappa = 0.7; alpha = -0.329; sexFactor = 1.018 }
  else { kappa = 0.9; alpha = -0.411; sexFactor = 1.0 } // m or d
  const ratio = scrMgdl / kappa
  return 141.0 * Math.min(ratio, 1.0) ** alpha * Math.max(ratio, 1.0) ** -1.209 * 0.993 ** ageYears * sexFactor
}

/** MDRD-4 (IDMS-traceable, Levey 2006). ml/min/1.73m². 'd' uses male factor.
 * Mirrors analyses/egfr.py:mdrd_4. */
export function mdrd4({ scrMgdl, ageYears, sex }: EgfrInput): number {
  const s = normaliseSex(sex)
  if (invalid(scrMgdl, ageYears, s)) return Number.NaN
  const sexFactor = s === 'w' ? 0.742 : 1.0
  return 175.0 * scrMgdl ** -1.154 * ageYears ** -0.203 * sexFactor
}

const EKFC_Q_UMOLL_PER_MGDL = 88.4

function ekfcQMgdl(ageYears: number, sex: Sex): number {
  const s = sex === 'd' ? 'm' : sex
  if (ageYears <= 25) {
    const qUmoll = s === 'm'
      ? Math.exp(3.200 + 0.259 * ageYears - 0.543 * Math.log(ageYears) - 0.00763 * ageYears ** 2 + 0.0000790 * ageYears ** 3)
      : Math.exp(3.080 + 0.177 * ageYears - 0.223 * Math.log(ageYears) - 0.00596 * ageYears ** 2 + 0.0000686 * ageYears ** 3)
    return qUmoll / EKFC_Q_UMOLL_PER_MGDL
  }
  return s === 'm' ? 0.90 : 0.70
}

/** EKFC 2021 creatinine equation (Pottel H et al., Ann Intern Med
 * 2021;174:183, doi:10.7326/M20-4366). ml/min/1.73m². Full age spectrum: valid
 * from age 2 (since 2026-11-22, issue #66; before, sub-18 rows returned NaN).
 * Whether a minor's row uses it is decided by the eGFR derivation (series.ts),
 * not here. 'd' uses the male Q value. */
export function ekfc2021({ scrMgdl, ageYears, sex }: EgfrInput): number {
  const s = normaliseSex(sex)
  if (invalid(scrMgdl, ageYears, s, MIN_PAEDIATRIC_EGFR_AGE)) return Number.NaN
  if (s === null) return Number.NaN
  const ratio = scrMgdl / ekfcQMgdl(ageYears, s)
  const exponent = ratio < 1.0 ? -0.322 : -1.132
  const ageFactor = ageYears > 40 ? 0.990 ** (ageYears - 40) : 1.0
  return 107.3 * ratio ** exponent * ageFactor
}

/** CKiD U25 age band limits (Pierce CB et al., Kidney Int 2021;99:948,
 * PMID 33301749): the equation covers ages 1 to 25. */
export const CKID_U25_MIN_AGE = 1
export const CKID_U25_MAX_AGE = 25

/** The sex- and age-dependent constant k of CKiD U25 creatinine (Pierce
 * 2021), for eGFR = k × height [m] / Scr [mg/dl]:
 *
 *   male:   age < 12: 39.0 × 1.008^(age − 12); 12 ≤ age < 18: 39.0 × 1.045^(age − 12); age ≥ 18: 50.8
 *   female: age < 12: 36.1 × 1.008^(age − 12); 12 ≤ age < 18: 36.1 × 1.023^(age − 12); age ≥ 18: 41.4
 *
 * 'd' uses the male constants, as in the other formulas. */
export function ckidU25K(ageYears: number, sex: Sex): number {
  const male = sex !== 'w'
  if (ageYears >= 18) return male ? 50.8 : 41.4
  const base = male ? 39.0 : 36.1
  if (ageYears >= 12) return base * (male ? 1.045 : 1.023) ** (ageYears - 12)
  return base * 1.008 ** (ageYears - 12)
}

/** CKiD U25 creatinine equation (Pierce 2021). ml/min/1.73m². Height enters in
 * metres: k × (heightCm / 100) / Scr. NaN outside ages 1 to below 26 (25
 * completed years), for unknown sex, non-positive creatinine or height. */
export function ckidU25({ scrMgdl, ageYears, sex, heightCm }: HeightEgfrInput): number {
  const s = normaliseSex(sex)
  if (invalid(scrMgdl, ageYears, s, CKID_U25_MIN_AGE) || !(ageYears < CKID_U25_MAX_AGE + 1) || !(heightCm > 0)) return Number.NaN
  return ckidU25K(ageYears, s!) * (heightCm / 100) / scrMgdl
}

/** Bedside Schwartz (Schwartz GJ et al., JASN 2009;20:629, PMID 19158356):
 * 0.413 × height [cm] / Scr [mg/dl]. ml/min/1.73m². Offered only for
 * comparison with older studies; the derivation applies it to ages 2 to 17.
 * The equation has no sex term; NaN for non-positive creatinine or height. */
export function bedsideSchwartz({ scrMgdl, heightCm }: Pick<HeightEgfrInput, 'scrMgdl' | 'heightCm'>): number {
  if (!(scrMgdl > 0) || !(heightCm > 0)) return Number.NaN
  return 0.413 * heightCm / scrMgdl
}
