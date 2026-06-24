import { describe, expect, it } from 'vitest'
import {
  effectForEvent,
  normalizeClinicalEvents,
  validateClinicalEvents,
} from '../../../src/core/events/events'
import type { LabRow } from '../../../src/core/types'

function labRow(id: number): LabRow {
  return {
    patientId: id,
    labDatum: new Date('2024-01-01'),
    bezeichnung: 'eGFR',
    einheit: 'ml/min/1,73m²',
    wert: '45',
    wertNum: 45,
    wertOperator: '=',
    loinc: null,
    patientSex: null,
    patientAgeAtLab: 60,
  }
}

describe('clinical events', () => {
  it('normalizes structured clinical event rows', () => {
    const rows = [
      {
        patientId: 1,
        type: 'kidney_transplant',
        date: new Date('2024-01-10'),
        title: 'Transplant',
        description: 'living donor',
        endDate: null,
        intent: '',
      },
      {
        patientId: '2',
        type: 'dialysis',
        date: new Date('2024-02-01'),
        title: 'Dialysis',
        description: '',
        endDate: new Date('2024-02-12'),
        intent: 'acute',
      },
      {
        patientId: 3,
        type: 'other',
        date: new Date('2024-03-01'),
        title: 'Clinical note',
        description: undefined,
        endDate: '',
        intent: '',
      },
    ]

    expect(normalizeClinicalEvents(rows)).toEqual([
      {
        patientId: 1,
        type: 'kidney_transplant',
        date: new Date('2024-01-10'),
        title: 'Transplant',
        description: 'living donor',
        endDate: null,
        intent: '',
      },
      {
        patientId: 2,
        type: 'dialysis',
        date: new Date('2024-02-01'),
        title: 'Dialysis',
        description: null,
        endDate: new Date('2024-02-12'),
        intent: 'acute',
      },
      {
        patientId: 3,
        type: 'other',
        date: new Date('2024-03-01'),
        title: 'Clinical note',
        description: null,
        endDate: null,
        intent: '',
      },
    ])
  })

  it('rejects legacy event headers', () => {
    expect(() =>
      normalizeClinicalEvents([
        { PatientID: 1, ReferenceDate: new Date('2024-01-01'), label: 'note' },
      ]),
    ).toThrow('Legacy annotation schema is no longer supported. Use patientId,type,date,title.')
  })

  it('throws when required structured columns are missing', () => {
    expect(() => normalizeClinicalEvents([{ patientId: 1, type: 'other' }])).toThrow(
      'Event file missing required column(s): patientId, type, date, title.',
    )
  })

  it('parses German-style string dates as normalized UTC dates', () => {
    const [event] = normalizeClinicalEvents([
      {
        patientId: 1,
        type: 'dialysis',
        date: '31.12.2024',
        title: 'Dialysis',
        endDate: '02.01.2025',
        intent: 'acute',
      },
    ])

    expect(event.date).toEqual(new Date(Date.UTC(2024, 11, 31)))
    expect(event.endDate).toEqual(new Date(Date.UTC(2025, 0, 2)))
  })

  it('validates enum fields, warnings, and row-level rejects', () => {
    const events = normalizeClinicalEvents([
      {
        patientId: 1,
        type: 'dialysis',
        date: new Date('2024-01-01'),
        title: 'Dialysis',
        intent: '',
      },
      {
        patientId: 1,
        type: 'kidney_transplant',
        date: new Date('2024-02-01'),
        title: 'Transplant',
      },
      {
        patientId: 99,
        type: 'dialysis',
        date: new Date('2024-03-01'),
        title: 'Chronic dialysis',
        intent: 'chronic',
      },
      {
        patientId: 1,
        type: 'dialysis',
        date: new Date('2024-04-10'),
        title: 'Bad interval',
        endDate: new Date('2024-04-01'),
        intent: 'acute',
      },
      {
        patientId: 1,
        type: 'other',
        date: new Date('2024-05-01'),
        title: 'Other',
        intent: 'acute',
      },
      {
        patientId: 1,
        type: 'kidney_transplant',
        date: new Date('2024-06-01'),
        title: 'Bad transplant',
        endDate: new Date('2024-06-02'),
      },
      {
        patientId: 1,
        type: 'hospitalization',
        date: new Date('2024-07-01'),
        title: 'Bad type',
      },
    ])

    const result = validateClinicalEvents(events, [labRow(1)])

    expect(result.valid).toHaveLength(3)
    expect(result.valid[0]).toMatchObject({
      patientId: 1,
      type: 'dialysis',
      intent: 'unknown',
      warning: 'unknown_dialysis_intent',
    })
    expect(result.valid[1]).toMatchObject({
      patientId: 1,
      type: 'kidney_transplant',
      intent: null,
    })
    expect(result.valid[2]).toMatchObject({
      patientId: 99,
      type: 'dialysis',
      intent: 'chronic',
      warning: 'unknown_patient',
    })
    expect(result.rejected.map((event) => event.reason)).toEqual([
      'invalid_date_range',
      'invalid_intent',
      'invalid_date_range',
      'invalid_type',
    ])
  })

  it('classifies effects without free-text inference', () => {
    expect(
      effectForEvent({
        patientId: 1,
        type: 'dialysis',
        date: new Date('2024-01-01'),
        title: 'unknown open',
        description: null,
        endDate: null,
        intent: 'unknown',
        warning: '',
      }).effect,
    ).toBe('warning_no_exclusion')
    expect(
      effectForEvent({
        patientId: 1,
        type: 'dialysis',
        date: new Date('2024-01-01'),
        title: 'unknown interval',
        description: null,
        endDate: new Date('2024-01-02'),
        intent: 'unknown',
        warning: '',
      }).effect,
    ).toBe('exclude_interval')
    expect(
      effectForEvent({
        patientId: 1,
        type: 'dialysis',
        date: new Date('2024-01-01'),
        title: 'acute open',
        description: null,
        endDate: null,
        intent: 'acute',
        warning: '',
      }).effect,
    ).toBe('warning_no_exclusion')
    expect(
      effectForEvent({
        patientId: 1,
        type: 'dialysis',
        date: new Date('2024-01-01'),
        title: 'acute interval',
        description: null,
        endDate: new Date('2024-01-02'),
        intent: 'acute',
        warning: '',
      }).effect,
    ).toBe('exclude_interval')
    expect(
      effectForEvent({
        patientId: 1,
        type: 'dialysis',
        date: new Date('2024-01-01'),
        title: 'chronic',
        description: null,
        endDate: null,
        intent: 'chronic',
        warning: '',
      }).effect,
    ).toBe('censor_from_date')
    expect(
      effectForEvent({
        patientId: 1,
        type: 'kidney_transplant',
        date: new Date('2024-01-01'),
        title: 'transplant',
        description: null,
        endDate: null,
        intent: null,
        warning: '',
      }).effect,
    ).toBe('censor_from_date')
    expect(
      effectForEvent({
        patientId: 1,
        type: 'other',
        date: new Date('2024-01-01'),
        title: 'other',
        description: null,
        endDate: null,
        intent: null,
        warning: '',
      }).effect,
    ).toBe('display_only')
  })
})
