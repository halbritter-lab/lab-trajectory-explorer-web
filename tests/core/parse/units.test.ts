import { describe, it, expect } from 'vitest'
import { unitKey } from '../../../src/core/parse/units'
import { isSerumCreatinineSource, normaliseUnit } from '../../../src/core/egfr/series'

describe('unitKey', () => {
  it('ignores case, spacing and micro-sign spelling', () => {
    for (const unit of ['µmol/l', 'umol/L', 'μmol/l', ' µmol / l ', 'UMOL/L']) expect(unitKey(unit)).toBe('µmol/l')
    expect(unitKey('mg/dL')).toBe(unitKey('mg/dl'))
    // All-capitals spellings carry no case information and are folded.
    expect(unitKey('MG/DL')).toBe(unitKey('mg/dl'))
    expect(unitKey('IU/L')).toBe(unitKey('IU/l'))
    expect(unitKey('U/L')).toBe(unitKey('u/l'))
    expect(unitKey('/ul')).toBe(unitKey('/µl'))
    expect(unitKey('uU/ml')).toBe(unitKey('µU/ml'))
  })

  it('keeps different units apart', () => {
    expect(unitKey('mg/dl')).not.toBe(unitKey('µmol/l'))
    // "U/l" is the enzyme unit, not a micro prefix; milli-units stay milli.
    expect(unitKey('U/l')).toBe('u/l')
    expect(unitKey('mU/l')).not.toBe(unitKey('µU/l'))
    // Case only merges where it cannot change an SI prefix: milli vs mega,
    // pico vs peta, gram vs giga.
    expect(unitKey('mU/l')).not.toBe(unitKey('MU/l'))
    expect(unitKey('pg/ml')).not.toBe(unitKey('Pg/ml'))
    expect(unitKey('g/l')).not.toBe(unitKey('G/l'))
    expect(unitKey('G/L')).toBe(unitKey('G/l'))
    expect(unitKey('ml/min/1,73m²')).not.toBe(unitKey('ml/min/1.73m²'))
  })

  it('drives eGFR source detection', () => {
    expect(normaliseUnit('umol/L')).toBe('µmol/l')
    expect(isSerumCreatinineSource(['Kreatinin', 'mg/dL'])).toBe(true)
    expect(isSerumCreatinineSource(['Kreatinin', 'μmol / l'])).toBe(true)
  })
})
