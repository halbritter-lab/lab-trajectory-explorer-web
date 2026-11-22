import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceApp } from '../../src/workspace/WorkspaceApp'
import { browserLanguage, getLanguage, inEnglish, setLanguage, t, tp } from '../../src/i18n'

describe('interface language (issue #71)', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  })
  afterEach(() => { vi.restoreAllMocks() })
  it('starts in German for any de* browser language and in English otherwise', () => {
    const languages = vi.spyOn(navigator, 'languages', 'get')
    for (const [tags, expected] of [[['de-DE', 'en'], 'de'], [['de'], 'de'], [['DE-at'], 'de'], [['en-US', 'de'], 'en'], [['fr'], 'en'], [[], 'en']] as const) {
      languages.mockReturnValue([...tags])
      expect(browserLanguage(), tags.join(',')).toBe(tags.length ? expected : (navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'))
    }
  })
  it('switches the interface, the lang attribute and the footer statement from the header', () => {
    render(<WorkspaceApp />)
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('button', { name: 'Deutsch' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Deutsch' }))
    expect(getLanguage()).toBe('de')
    expect(document.documentElement.lang).toBe('de')
    expect(screen.getByRole('button', { name: 'Deutsch' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Daten' })).toBeInTheDocument()
    expect(screen.getByText(/^Nur für Forschungszwecke\. Kein Medizinprodukt/)).toBeInTheDocument()
    expect(screen.getByText('Noch keine Daten geladen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('button', { name: 'Data' })).toBeInTheDocument()
    expect(screen.getByText(/^Research use only\. Not a medical device/)).toBeInTheDocument()
  })
  it('fills placeholders, chooses singular or plural and composes exports in English', () => {
    act(() => setLanguage('de'))
    expect(tp('{n} patient', '{n} patients', 1)).toBe('1 Patient')
    expect(tp('{n} patient', '{n} patients', 3)).toBe('3 Patienten')
    expect(t('Version {version}', { version: '1.2' })).toBe('Version 1.2')
    expect(inEnglish(() => tp('{n} patient', '{n} patients', 3))).toBe('3 patients')
    // The interface language is back after the export.
    expect(getLanguage()).toBe('de')
  })
})
