import { useEffect, useState } from 'react'

/** Minimum confirmation interval in days. Keeps the typed text as a draft so an
 * empty or partial value does not snap back to the default mid-edit; only whole
 * numbers of at least one day are committed, and blur restores the committed value. */
export function ConfirmationDaysInput({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <input
      type="number"
      min={1}
      step={1}
      aria-label="Minimum confirmation interval (days)"
      value={draft}
      onChange={e => {
        setDraft(e.target.value)
        const days = Number(e.target.value)
        if (e.target.value !== '' && Number.isInteger(days) && days >= 1) onChange(days)
      }}
      onBlur={() => setDraft(String(value))}
    />
  )
}
