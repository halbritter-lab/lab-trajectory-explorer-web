import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const paths = {
  search: 'm20 20-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  parameters: 'M4 5h16v14H4z M10 5v14 M15 5v14',
  filter: 'M4 6h16 M7 12h10 M10 18h4',
  sort: 'M8 4v16 m-4-4 4 4 4-4 M15 5h5 M15 10h4 M15 15h3',
  view: 'M4 6h16 M4 12h16 M4 18h16 M9 3v6 M15 9v6 M8 15v6',
  analysis: 'M4 18V6 M4 18h16 M7 14l4-5 4 2 5-7',
  chart: 'M4 17l6-6 4 3 6-9 M15 5h5v5',
  close: 'm6 6 12 12 M6 18 18 6',
  external: 'M14 4h6v6 M20 4 10 14 M10 5H5v14h14v-5',
  info: 'M12 11v6 M12 7v.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  warning: 'M12 8v5 M12 17v.01 M10.3 3.8 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0',
  event: 'm13 2-9 12h7l-1 8 10-13h-7z',
  endpoint: 'M5 21V3 M5 4h13l-3 4 3 4H5',
  excluded: 'M8 8l8 8 M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  chevron: 'm9 5 7 7-7 7',
} as const

export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

export function ToolPopover({ name, icon, open, onToggle, onClose, badge, children }: {
  name: string; icon: keyof typeof paths; open: boolean; onToggle: () => void; onClose: () => void; badge?: number; children: ReactNode;
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const close = useRef(onClose)
  close.current = onClose
  useLayoutEffect(() => {
    if (!open) return
    const anchor = trigger.current!.getBoundingClientRect()
    const rect = content.current!.getBoundingClientRect()
    setPosition({ left: Math.max(8, Math.min(anchor.right - rect.width, innerWidth - rect.width - 8)), top: Math.max(8, Math.min(anchor.bottom + 6, innerHeight - rect.height - 8)) })
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !content.current?.contains(event.target as Node)) close.current() }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) { event.preventDefault(); event.stopPropagation(); close.current(); trigger.current?.focus() }
    }
    content.current?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true })
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className="pv-popover-root" ref={root}>
    <button className={`pv-tool ${open || badge ? 'pv-tool-active' : ''}`} type="button" ref={trigger} aria-expanded={open} aria-controls={id} onClick={onToggle}><Icon name={icon} />{name}{badge ? <span className="pv-count">{badge}</span> : null}</button>
    {open && createPortal(<div id={id} ref={content} className="pv-popover" role="region" aria-label={`${name} options`} style={position} onBlur={event => {
      // Clicking label text temporarily blurs the input before native label
      // activation focuses its checkbox. Outside pointer clicks close above.
      if (event.relatedTarget && !root.current?.contains(event.relatedTarget as Node) && !content.current?.contains(event.relatedTarget as Node)) close.current()
    }}><h2>{name}</h2>{children}</div>, document.body)}
  </div>
}

export function AnalysisDrawer({ open, onClose, children, title = 'Analysis' }: { open: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  const drawer = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const dialog = drawer.current!
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const mobile = window.matchMedia('(max-width: 900px)')
    const show = () => {
      dialog.close()
      if (mobile.matches) dialog.showModal(); else dialog.show()
      dialog.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
      dialog.scrollTop = 0
    }
    show()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) { event.preventDefault(); close.current() } }
    document.addEventListener('keydown', escape)
    mobile.addEventListener('change', show)
    return () => { dialog.close(); document.removeEventListener('keydown', escape); mobile.removeEventListener('change', show); previous?.focus({ preventScroll: true }) }
  }, [open])
  return <dialog className="pv-analysis-panel" ref={drawer} aria-labelledby="pv-analysis-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="pv-panel-heading"><div><h2 id="pv-analysis-title">{title}</h2><p>Changes apply immediately.</p></div><button type="button" aria-label="Close analysis settings" onClick={onClose}><Icon name="close" /></button></div>
    <div className="pv-panel-content">{children}</div>
  </dialog>
}

export function Hint({ label, children, icon = 'info', tone = 'neutral', text }: {
  label: string; children: ReactNode; icon?: keyof typeof paths; tone?: string; text?: string;
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const tooltip = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>()
  const enter = () => { clearTimeout(leaveTimer.current); setDismissed(false); setHovered(true) }
  const leave = () => { leaveTimer.current = setTimeout(() => setHovered(false), 120) }
  useEffect(() => () => clearTimeout(leaveTimer.current), [])
  const open = !dismissed && (hovered || focused || pinned)
  useLayoutEffect(() => {
    if (!open) return
    const rect = trigger.current!.getBoundingClientRect()
    const tip = tooltip.current!.getBoundingClientRect()
    setPosition({ left: Math.max(8, Math.min(rect.left, innerWidth - tip.width - 8)), top: rect.bottom + tip.height + 16 < innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - tip.height - 6) })
  }, [open])
  useEffect(() => {
    if (!open) return
    const dismiss = () => { setPinned(false); setDismissed(true) }
    const dismissOnScroll = () => setDismissed(true)
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !tooltip.current?.contains(event.target as Node)) dismiss() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('scroll', dismissOnScroll, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('scroll', dismissOnScroll, true) }
  }, [open])
  return <>
    <button type="button" ref={trigger} className={`pv-hint pv-hint-${tone} ${text ? 'pv-hint-label' : ''}`} aria-label={label} aria-describedby={open ? id : undefined}
      onMouseEnter={enter} onMouseLeave={leave}
      onFocus={() => { setDismissed(false); setFocused(true) }} onBlur={() => setFocused(false)}
      onClick={() => { setDismissed(pinned); setPinned(value => !value) }}><Icon name={icon} />{text && <span>{text}</span>}</button>
    {open && createPortal(<div id={id} role="tooltip" ref={tooltip} className="pv-hint-tooltip" style={position} onMouseEnter={enter} onMouseLeave={leave}><strong>{label}</strong><div>{children}</div></div>, document.body)}
  </>
}
