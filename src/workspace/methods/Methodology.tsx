import { useEffect, useRef, useState } from 'react'
import { getMethodLocation, methodTopics, type HelpWorkspace } from './method-navigation'
import { Start } from './topics/Start'
import { Data } from './topics/Data'
import { Trajectories } from './topics/Trajectories'
import { Fits } from './topics/Fits'
import { Endpoints } from './topics/Endpoints'
import { Aki } from './topics/Aki'
import { Cohort } from './topics/Cohort'
import { Export } from './topics/Export'
import { Sources } from './topics/Sources'
import './methodology.css'

const content = { start: Start, data: Data, trajectories: Trajectories, fits: Fits, endpoints: Endpoints, aki: Aki, cohort: Cohort, export: Export, sources: Sources }

/** Topic-based help with bookmarkable routes and native browser history. */
export function Methodology({ onNavigate, returnTo = 'Data' }: { onNavigate?: (page: HelpWorkspace) => void; returnTo?: HelpWorkspace }) {
  const [location, setLocation] = useState(() => getMethodLocation() ?? { topic: 'start' as const, section: '' })
  const [menuOpen, setMenuOpen] = useState(false)
  const article = useRef<HTMLElement>(null)
  const topic = methodTopics.find(item => item.id === location.topic)!
  const Content = content[topic.id]

  useEffect(() => {
    const sync = () => {
      const next = getMethodLocation()
      if (!next) return
      setLocation(next)
      setMenuOpen(false)
    }
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  useEffect(() => {
    const target = location.section
      ? article.current?.querySelector<HTMLElement>(`[id="methods-${location.section}"]`)
      : null
    if (target) {
      let disclosure = target.closest('details')
      while (disclosure) {
        disclosure.open = true
        disclosure = disclosure.parentElement?.closest('details') ?? null
      }
    }
    const heading = target ?? article.current?.querySelector<HTMLElement>('h2')
    heading?.focus({ preventScroll: true })
    // Keep the page title and mobile topic menu in view on a topic change.
    const scrollTarget = target ?? article.current?.closest('.workspace-methodology') ?? heading
    scrollTarget?.scrollIntoView?.({ block: 'start' })
  }, [location])

  return <div className="methodology-layout">
    <aside className="methodology-sidebar">
      {onNavigate && <button className="methodology-return" type="button" onClick={() => onNavigate(returnTo)}>Back to {returnTo}</button>}
      <button className="methodology-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="methodology-topics" onClick={() => setMenuOpen(!menuOpen)}>
        Topic: {topic.label}
      </button>
      <nav id="methodology-topics" className={`methodology-topics${menuOpen ? ' is-open' : ''}`} aria-label="Help topics">
        {['Get started', 'Analysis & interpretation', 'Reference'].map(group => <div className="methodology-topic-group" key={group}>
          <p>{group}</p>
          {methodTopics.filter(item => item.group === group).map(item => <a key={item.id} href={`#methods/${item.id}`} aria-current={topic.id === item.id ? 'page' : undefined}>{item.label}</a>)}
        </div>)}
      </nav>
    </aside>
    <article className="methodology-page" ref={article} key={topic.id} aria-labelledby="methodology-topic-title">
      <h2 id="methodology-topic-title" tabIndex={-1}>{topic.label}</h2>
      {topic.sections.length > 0 && <nav className="methodology-section-nav" aria-label="On this page">
        <span>On this page</span>
        {topic.sections.map(section => <a key={section.id} href={`#methods/${topic.id}/${section.id}`} onClick={() => {
          // A matching hash emits no event; still reopen a manually closed disclosure.
          if (window.location.hash === `#methods/${topic.id}/${section.id}`) setLocation({ ...location })
        }}>{section.label}</a>)}
      </nav>}
      {topic.id === 'start' ? <Start onNavigate={onNavigate} /> : <Content />}
      <footer className="methodology-article-footer">
        <a href={`#methods/${topic.id}`} onClick={() => {
          if (window.location.hash === `#methods/${topic.id}`) setLocation({ topic: topic.id, section: '' })
        }}>Back to topic overview</a>
        {onNavigate && <button type="button" onClick={() => onNavigate(returnTo)}>Back to {returnTo}</button>}
      </footer>
    </article>
  </div>
}
