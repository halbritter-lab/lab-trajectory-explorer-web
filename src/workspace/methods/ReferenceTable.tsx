import type { ReactNode } from 'react'

/** Keep comparison columns readable and scrollable by keyboard on narrow screens. */
export function ReferenceTable({ label, children }: { label: string; children: ReactNode }) {
  return <>
    <p className="methodology-table-hint">Scroll horizontally to compare all columns. With the table focused, use the arrow keys.</p>
    <div className="methodology-table" role="region" aria-label={label} tabIndex={0}>{children}</div>
  </>
}
