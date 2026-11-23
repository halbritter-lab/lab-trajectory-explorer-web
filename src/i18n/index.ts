/**
 * The interface language (issue #71, owner decision 2026-11-21): English, the
 * source language, and German. Dependency-free on purpose.
 *
 * Messages are keyed by their English text (gettext style): `t('Data')`. The
 * English catalog (`en.ts`) lists every key and is regenerated from the
 * source by `node scripts/i18n_extract.mjs`; `t()` accepts only listed keys,
 * so a new or changed English text fails the type check until the catalog is
 * regenerated, and the German catalog (`de.ts`) must translate every key.
 * Placeholders are written `{name}` and filled from `params`. A key may end
 * in a context (`'Fit model||verb'`) when one English text needs two German ones.
 *
 * What stays English in both languages: exports (column names, sheet
 * contents, about notes, chart figures and their disclaimers), the method
 * reference, the Methods page text (the maintainer's authored text, OD-90)
 * and imported names, values and units.
 */
import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { EN_MESSAGES, type MessageKey } from './en'
import { de } from './de'

export type { MessageKey } from './en'
export type Language = 'en' | 'de'
export const LANGUAGES: readonly Language[] = ['en', 'de']
export const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'de'

/** The browser's preferred language: German for any `de*` tag, otherwise English. */
export function browserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en'
  const first = navigator.languages?.[0] ?? navigator.language ?? ''
  return first.toLowerCase().startsWith('de') ? 'de' : 'en'
}

let current: Language = browserLanguage()
/** `transient`: a switch for the length of an export (`renderedInEnglish`),
 * which a listener that saves the choice ignores. */
const listeners = new Set<(transient: boolean) => void>()

function applyDocumentLanguage(language: Language) {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}
applyDocumentLanguage(current)

export function getLanguage(): Language { return current }

function switchTo(language: Language, transient: boolean) {
  if (language === current) return
  current = language
  applyDocumentLanguage(language)
  for (const listener of [...listeners]) listener(transient)
}

/** Switch the interface language; every component that reads it renders again. */
export function setLanguage(language: Language): void { switchTo(language, false) }

export function subscribeLanguage(listener: (transient: boolean) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Render the interface in English, run `make`, and render it in the
 * interface language again, all before the browser paints. For exports
 * that copy rendered elements (chart figures, issue #71): they read the
 * English page. Call it from an event handler, not while rendering; `make`
 * must be synchronous.
 */
export function renderedInEnglish<T>(make: () => T): T {
  const previous = current
  if (previous === 'en') return make()
  flushSync(() => switchTo('en', true))
  try { return make() } finally { flushSync(() => switchTo(previous, true)) }
}

/**
 * Run `make` with the interface language set to `language`, then restore it
 * without notifying anyone. For exports: they are English whatever the
 * interface shows. `make` must be synchronous.
 */
export function inLanguage<T>(language: Language, make: () => T): T {
  const previous = current
  current = language
  try { return make() } finally { current = previous }
}
/** Shorthand for exports, which are English in every interface language. */
export const inEnglish = <T>(make: () => T): T => inLanguage('en', make)

export type MessageParams = Record<string, string | number>

function fill(text: string, params?: MessageParams): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => Object.hasOwn(params, name) ? String(params[name]) : whole)
}

/** The message in the current language, with its placeholders filled. */
export function t(key: MessageKey, params?: MessageParams): string {
  return fill(current === 'de' ? de[key] : englishText(key), params)
}

/** A key may carry a context after `||` where one English text needs two
 * translations ("Fit model||verb"); English shows the text before it. */
const englishText = (key: string) => {
  const context = key.indexOf('||')
  return context < 0 ? key : key.slice(0, context)
}

/** Singular or plural message by `count` (English and German share the rule:
 * one is singular). `{n}` is filled with the count. */
export function tp(one: MessageKey, other: MessageKey, count: number, params?: MessageParams): string {
  return t(count === 1 ? one : other, { n: count, ...params })
}

const KNOWN: ReadonlySet<string> = new Set(EN_MESSAGES)
/** A fixed text from outside the interface layer (a core module label, a
 * preset name, an exclusion reason): translated when the catalog lists it
 * (see `core-labels.ts`), otherwise shown as it is. */
export function tx(text: string, params?: MessageParams): string {
  return KNOWN.has(text) ? t(text as MessageKey, params) : fill(text, params)
}

/** Marks a message key without translating it, for constant tables that are
 * translated where they are shown: `t(LABELS[id])`. */
export const msg = <K extends MessageKey>(key: K): K => key

/** A message whose placeholders are filled with elements (links, emphasis). */
export function tr(key: MessageKey, params: Record<string, ReactNode>): ReactNode {
  const text = t(key)
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(/\{(\w+)\}/g)) {
    parts.push(text.slice(last, match.index))
    parts.push(Object.hasOwn(params, match[1]) ? params[match[1]] : match[0])
    last = match.index! + match[0].length
  }
  parts.push(text.slice(last))
  return createElement(Fragment, null, ...parts)
}

/** The current language; the component renders again when it changes. */
const subscribeRender = (onChange: () => void) => subscribeLanguage(() => onChange())
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeRender, getLanguage, getLanguage)
}

/** `t`, with the component subscribed to language changes. Components that
 * show messages call it (or `useLanguage`) so that they render again on a
 * switch even when a parent is memoised. */
export function useT(): typeof t {
  useLanguage()
  return t
}
