import type { Sex } from '../types'

export interface EgfrInput {
  scrMgdl: number
  ageYears: number
  sex: Sex | string | null
}

export function normaliseSex(sex: string | null | undefined): Sex | null {
  if (sex == null) return null
  const s = sex.toLowerCase().trim()
  return s === 'm' || s === 'w' || s === 'd' ? (s as Sex) : null
}

function invalid(scr: number, age: number, s: Sex | null): boolean {
  return s === null || !(scr > 0) || Number.isNaN(scr) || !(age >= 18) || Number.isNaN(age)
}

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

/** EKFC 2021 creatinine equation (Pottel 2021). ml/min/1.73m².
 * The published equation is full-age-spectrum; this app keeps eGFR adult-only
 * for consistency, so sub-18 rows return NaN. 'd' uses the male Q value. */
export function ekfc2021({ scrMgdl, ageYears, sex }: EgfrInput): number {
  const s = normaliseSex(sex)
  if (invalid(scrMgdl, ageYears, s)) return Number.NaN
  if (s === null) return Number.NaN
  const ratio = scrMgdl / ekfcQMgdl(ageYears, s)
  const exponent = ratio < 1.0 ? -0.322 : -1.132
  const ageFactor = ageYears > 40 ? 0.990 ** (ageYears - 40) : 1.0
  return 107.3 * ratio ** exponent * ageFactor
}
