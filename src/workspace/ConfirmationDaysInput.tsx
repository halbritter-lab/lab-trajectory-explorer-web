import { useEffect, useState } from 'react'
import { MAX_CONFIRMATION_DAYS } from '../core/domains/nephrology/constants'

/** Minimum confirmation interval in days. Keeps the typed text as a draft so an
 * empty or partial value does not snap back to the default mid-edit; only whole
 * numbers from one day to the maximum are committed, and blur restores the
 * committed value. A larger value is rejected with an explanation: a confirming
 * value must follow within 12 calendar months, so it could never confirm. */
export function ConfirmationDaysInput({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const [rejected, setRejected] = useState<number | null>(null)
  useEffect(() => setDraft(String(value)), [value])
  return (
    <>
      <input
        type="number"
        min={1}
        max={MAX_CONFIRMATION_DAYS}
        step={1}
        aria-label="Minimum confirmation interval (days)"
        aria-invalid={rejected !== null}
        value={draft}
        onChange={e => {
          setDraft(e.target.value)
          const days = Number(e.target.value)
          const whole = e.target.value !== '' && Number.isInteger(days) && days >= 1
          setRejected(whole && days > MAX_CONFIRMATION_DAYS ? days : null)
          if (whole && days <= MAX_CONFIRMATION_DAYS) onChange(days)
        }}
        onBlur={() => setDraft(String(value))}
      />
      {rejected !== null && <span role="alert" className="wt-muted"> {rejected} days not applied: a confirming value must follow within 12 calendar months, so the minimum interval cannot exceed {MAX_CONFIRMATION_DAYS} days. Still {value} days.</span>}
    </>
  )
}
