import { t } from '../../i18n'
export interface RowGroup<T> {
  key: string
  value: string | null
  label: string
  rows: T[]
}

/** Label of the section of patients without a value for the grouping
 * attribute. The cohort export writes it into `group` for these patients. */
export const GROUP_NOT_RECORDED = 'Not recorded'

export const normalizedGroupValue = (value: string | null | undefined): string | null => value?.trim() ? value : null
export const groupKey = (value: string | null | undefined): string => JSON.stringify(normalizedGroupValue(value))

/** Input order is the current patient sort. Grouping preserves it within each
 * section. Sections are ordered by the raw group value, not by the shown
 * label: a label can be translated (sex), and the order of the sections is
 * the row order of the cohort export, which must not depend on the interface
 * language. Patients without a value come last. */
export function groupRows<T>(rows: readonly T[], getValue: (row: T) => string | null | undefined, label: (value: string) => string = value => value): RowGroup<T>[] {
  const groups = new Map<string, RowGroup<T>>()
  for (const row of rows) {
    const value = normalizedGroupValue(getValue(row))
    const key = groupKey(value)
    const group = groups.get(key) ?? { key, value, label: value === null ? t('Not recorded') : label(value), rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => a.value === null ? 1 : b.value === null ? -1 : a.value.localeCompare(b.value, 'en', { numeric: true }))
}

/** The rows of all sections in section order, each with the group value the
 * cohort export writes: the attribute value, or `GROUP_NOT_RECORDED` for the
 * section of patients without one. */
export function rowsWithGroupValue<T>(groups: readonly RowGroup<T>[]): (T & { groupValue: string })[] {
  return groups.flatMap(section => section.rows.map(row => ({ ...row, groupValue: section.value ?? GROUP_NOT_RECORDED })))
}
