import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// What the browser shows when the application script never runs: opened from
// file://, files missing after a deployment, JavaScript off. The behaviour in
// a real browser is covered by tests/e2e/start-and-offline.e2e.ts.
describe('static notice in index.html', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
  const page = new DOMParser().parseFromString(html, 'text/html')
  const root = page.getElementById('root')!

  it('sits inside #root, where the started application replaces it', () => {
    const notice = root.querySelector('.app-not-started')!
    const text = notice.textContent!.replace(/\s+/g, ' ')
    expect(notice.querySelector('h1')!.textContent).toBe('Lab Trajectory Explorer has not started')
    expect(text).toContain('If this text stays, the application could not be loaded')
    expect(text).toContain('The page was opened directly from a folder. This browser does not start the application from there. Serve the folder through a web server')
    expect(text).toContain('Check the connection and reload the page.')
    // K44 (2026-11-22): the notice for a page opened from a folder links to the online version.
    const online = notice.querySelector('li a')!
    expect(online.getAttribute('href')).toBe('https://halbritter-lab.github.io/lab-trajectory-explorer-web/')
    expect(online.closest('li')!.textContent).toContain('opened directly from a folder')
  })
  it('needs neither the stylesheet nor a script, and stays hidden for the first two seconds', () => {
    const style = page.querySelector('head style')!.textContent!
    expect(style).toMatch(/\.app-not-started \{[^}]*visibility: hidden; animation: app-not-started 0s 2s forwards;/)
    expect(style).toMatch(/@keyframes app-not-started \{ to \{ visibility: visible; \} \}/)
    expect(root.querySelector('script')).toBeNull()
  })
})
