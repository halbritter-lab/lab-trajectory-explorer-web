import { useEffect, useId, useRef, type ReactNode } from 'react'

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
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close.current() }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close.current(); trigger.current?.focus() }
    }
    content.current?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true })
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className="pv-popover-root" ref={root}>
    <button className={`pv-tool ${open || badge ? 'pv-tool-active' : ''}`} type="button" ref={trigger} aria-expanded={open} aria-controls={id} onClick={onToggle}><Icon name={icon} />{name}{badge ? <span className="pv-count">{badge}</span> : null}</button>
    <div id={id} ref={content} hidden={!open} className="pv-popover" role="region" aria-label={`${name} options`}><h2>{name}</h2>{children}</div>
  </div>
}

export function AnalysisDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const drawer = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const dialog = drawer.current!
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const mobile = window.matchMedia('(max-width: 900px)')
    const show = () => { dialog.close(); if (mobile.matches) dialog.showModal(); else dialog.show() }
    show()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close.current() } }
    document.addEventListener('keydown', escape)
    mobile.addEventListener('change', show)
    return () => { dialog.close(); document.removeEventListener('keydown', escape); mobile.removeEventListener('change', show); previous?.focus({ preventScroll: true }) }
  }, [open])
  return <dialog className="pv-analysis-panel" ref={drawer} aria-labelledby="pv-analysis-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="pv-panel-heading"><div><h2 id="pv-analysis-title">Analysis settings</h2><p>Configure the calculation, keep the data in view.</p></div><button type="button" aria-label="Close analysis settings" onClick={onClose}><Icon name="close" /></button></div>
    <div className="pv-panel-content">{children}</div>
  </dialog>
}
