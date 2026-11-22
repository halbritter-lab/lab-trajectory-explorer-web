import { useEffect, useState, type InputHTMLAttributes } from 'react'

/** A number field that keeps what is typed as a draft and applies it on
 * leaving the field or Enter, not on every keystroke: an emptied field or the
 * "7" on the way to "72" would otherwise recompute every episode or fit.
 * The spin buttons and arrow keys apply at once (their input events carry no
 * `inputType`). An empty or unreadable entry changes nothing and the field
 * shows the current value again; `normalise` turns a number into the value
 * that is applied (review of the combined branch, 2026-11-22). */
export function DraftNumberInput({ value, onCommit, normalise, ...input }: {
  value: number
  onCommit: (value: number) => void
  normalise: (value: number) => number
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = (text: string) => {
    const number = text.trim() === '' ? NaN : Number(text)
    if (!Number.isFinite(number)) { setDraft(String(value)); return }
    const next = normalise(number)
    setDraft(String(next))
    if (next !== value) onCommit(next)
  }
  return <input {...input} type="number" value={draft}
    onChange={event => {
      setDraft(event.target.value)
      if (!(event.nativeEvent as InputEvent).inputType) commit(event.target.value)
    }}
    onBlur={event => { commit(event.target.value); input.onBlur?.(event) }}
    onKeyDown={event => { if (event.key === 'Enter') commit(event.currentTarget.value); input.onKeyDown?.(event) }} />
}
