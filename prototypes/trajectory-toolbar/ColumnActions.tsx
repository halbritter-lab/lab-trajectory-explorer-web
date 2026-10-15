import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './PreviewControls'

export interface ColumnMetric { id: string; label: string; disabled?: boolean }

export function ColumnActions({ label, shortLabel, metrics, activeMetric, ascending, onSort, children }: {
  label: string; shortLabel?: string; metrics: ColumnMetric[]; activeMetric: string | null; ascending: boolean;
  onSort: (metric: string, ascending: boolean) => void; children?: ReactNode;
}) {
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = (restore = false) => { setAnchor(null); if (restore) trigger.current?.focus({ preventScroll: true }) }
  const show = () => { const rect = trigger.current!.getBoundingClientRect(); setAnchor({ left: rect.left, top: rect.bottom + 4 }) }
  useLayoutEffect(() => {
    if (!anchor) return
    const rect = menu.current!.getBoundingClientRect()
    setPosition({ left: Math.max(8, Math.min(anchor.left, innerWidth - rect.width - 8)), top: Math.max(8, Math.min(anchor.top, innerHeight - rect.height - 8)) })
    const focusTarget = menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]:not(:disabled)') ?? menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    focusTarget?.focus({ preventScroll: true })
  }, [anchor])
  useEffect(() => {
    if (!anchor) return
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setAnchor(null) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [anchor])
  const activeLabel = metrics.find(metric => metric.id === activeMetric)?.label
  return <div className="pv-column-header" onContextMenu={event => { event.preventDefault(); setAnchor({ left: event.clientX, top: event.clientY }) }} onKeyDown={event => {
    if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); show() }
  }}>
    <div className="pv-column-title"><button type="button" className="pv-column-sort" aria-label={label} onClick={() => onSort(metrics[0].id, activeMetric === metrics[0].id ? !ascending : false)}>{shortLabel ?? label}{activeMetric && <span className="pv-column-sort-state">{ascending ? '↑' : '↓'} {shortLabel ? '' : activeLabel}</span>}</button><button type="button" className="pv-column-more" ref={trigger} aria-label={`Column actions: ${label}`} aria-haspopup="menu" aria-expanded={Boolean(anchor)} aria-controls={id} onClick={() => anchor ? close() : show()}><Icon name="more" /></button></div>
    {children}
    {anchor && createPortal(<div className="pv-column-menu" role="menu" aria-label={`Sort ${label}`} id={id} ref={menu} style={position} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setAnchor(null) }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); close(true) }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus()
      }
    }}><p>{label}</p>{metrics.map(metric => <div className="pv-column-menu-group" role="group" aria-label={metric.label} key={metric.id}><span>{metric.label}</span>{[true, false].map(direction => <button type="button" role="menuitemradio" key={String(direction)} disabled={metric.disabled} aria-label={`${metric.label}: ${direction ? 'ascending' : 'descending'}`} aria-checked={activeMetric === metric.id && ascending === direction} onClick={() => { onSort(metric.id, direction); close(true) }}>{direction ? '↑ Ascending' : '↓ Descending'}</button>)}</div>)}</div>, document.body)}
  </div>
}
