import type { Sex } from '../types'

/**
 * Accepted spellings per sex code. German and English, short and long forms,
 * because datasets reach this app from both language settings and an
 * unrecognised value silently costs the patient their eGFR.
 *
 * Deliberately absent: 'other', 'x', 'unknown' and similar. They are not
 * synonyms of 'd' — mapping them there would silently apply male coefficients
 * (see the eGFR equations in domains/nephrology/egfr/formulas.ts) to a patient
 * whose sex was never recorded. Leaving them unrecognised surfaces them as
 * missing demographics, which is honest.
 */
const SEX_ALIASES: Record<Sex, readonly string[]> = {
  m: ['m', 'male', 'man', 'maennlich', 'mannlich', 'männlich', 'mann'],
  w: ['w', 'f', 'female', 'woman', 'weiblich', 'frau'],
  d: ['d', 'divers', 'diverse'],
}

const SEX_BY_ALIAS = new Map<string, Sex>(
  (Object.entries(SEX_ALIASES) as [Sex, readonly string[]][])
    .flatMap(([code, aliases]) => aliases.map((alias): [string, Sex] => [alias.normalize('NFC'), code])),
)

/** NFC-normalise before lookup: a CSV from a macOS toolchain carries "männlich"
 * decomposed (a + combining diaeresis), which is a different string from the NFC
 * literal above even though it renders identically. Without this the value is
 * rejected and then reported back to the user under a spelling that looks exactly
 * like one the message lists as accepted. */
function sexKey(sex: string): string {
  return sex.normalize('NFC').toLowerCase().trim()
}

export function normaliseSex(sex: string | null | undefined): Sex | null {
  if (sex == null) return null
  return SEX_BY_ALIAS.get(sexKey(sex)) ?? null
}

/** True when a value was supplied but matches no accepted spelling. Lets the UI
 * distinguish "no sex recorded" from "sex recorded in a spelling we dropped",
 * which otherwise both surface as a silently missing eGFR. */
export function isUnrecognisedSex(sex: string | null | undefined): boolean {
  if (sex == null) return false
  const s = sex.trim()
  return s !== '' && !SEX_BY_ALIAS.has(sexKey(s))
}
