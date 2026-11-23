/**
 * Texts the analysis modules compose in the core (AKI markers, bands and
 * legends, rapid-decline flags …) as the interface shows them (issue #71).
 * The core composes them in English for the exports; in German the
 * interface translates the known sentence patterns here, and a fixed text
 * listed in `core-labels.ts` through `tx()`. A text no pattern matches is
 * shown in English. Numbers, dates and units stay as composed.
 */
import { getLanguage, tx } from '../../i18n'

type Replacement = string | ((...groups: string[]) => string)
const one = (n: string) => n === '1'
const days = (n: string) => `${n} ${one(n) ? 'Tag' : 'Tage'}`

/** What an AKI window covers (`windowDescription` of the AKI module). */
function covers(text: string): string {
  return text
    .replace(/^the (\S+) days? after each onset \(shortened: with the window up to (\S+) days? after the episode end the fit would keep fewer than 3 dates over 365 days\)$/,
      (_m, a, b) => `die ${days(a)} nach jedem Beginn (verkürzt: mit dem Fenster bis ${days(b)} nach dem Episodenende behielte der Fit weniger als 3 Daten über 365 Tage)`)
    .replace(/^from each onset to (\S+) days? after the end of the episode$/, (_m, a) => `von jedem Beginn bis ${days(a)} nach dem Ende der Episode`)
    .replace(/^the windows supplied for this column$/, 'die für diese Spalte gelieferten Fenster')
}
const FIT_STATE: Record<string, string> = {
  'this column has no fit, so nothing is excluded': 'diese Spalte hat keinen Fit, daher wird nichts ausgeschlossen',
  'values inside are excluded from this fit': 'Werte darin sind von diesem Fit ausgeschlossen',
  'values inside are not excluded from this fit': 'Werte darin sind nicht von diesem Fit ausgeschlossen',
}
const fitState = (text: string) => FIT_STATE[text.charAt(0).toLowerCase() + text.slice(1)] ?? text
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
function reference(text: string): string {
  return text
    .replace(/^the mean of (\d+) values? 7 to 365 days before the admission$/, (_m, n) => `dem Mittelwert von ${n} ${one(n) ? 'Wert' : 'Werten'} 7 bis 365 Tage vor der Aufnahme`)
    .replace(/^the lowest later value of the admission \((.+), retrospective\)$/, 'dem niedrigsten späteren Wert der Aufnahme ($1, retrospektiv)')
    .replace(/^the lowest value of the 7 days before$/, 'dem niedrigsten Wert der 7 Tage davor')
}
const stagePart = (part: string) => part.replace(/^(\d+)× stage (\S+)$/, '$1× Stadium $2')

const RULES: Array<[RegExp, Replacement]> = [
  [/^AKI stage (\S+), onset (\S+), creatinine peak (\S+) mg\/dl on (\S+); staged (?:from (\S+) mg\/dl on (\S+) )?against (\S+) mg\/dl, (.+?)(; no measurement of this parameter on that date)?$/,
    (_m, stage, onset, peak, peakDate, from, fromDate, against, ref, off) => `AKI Stadium ${stage}, Beginn ${onset}, Kreatininmaximum ${peak} mg/dl am ${peakDate}; eingestuft ${from ? `nach ${from} mg/dl am ${fromDate} ` : ''}gegenüber ${against} mg/dl, ${reference(ref)}${off ? '; keine Messung dieses Parameters an diesem Datum' : ''}`],
  [/^AKI window (\S+) to (\S+) \((\d+) days\): (.+), overlapping windows drawn as one\. (.+)\.$/,
    (_m, start, end, n, what, state) => `AKI-Fenster ${start} bis ${end} (${days(n)}): ${covers(what)}, überlappende Fenster als eines gezeichnet. ${capital(fitState(state))}.`],
  [/^ Shaded: AKI window, (.+); (.+)$/, (_m, what, state) => ` Schattiert: AKI-Fenster, ${covers(what)}; ${fitState(state)}`],
  [/^In this column nothing is excluded for AKI( \(it has no fit\))?: the shaded band only shows the window (.+)\.$/,
    (_m, noFit, what) => `In dieser Spalte wird für AKI nichts ausgeschlossen${noFit ? ' (sie hat keinen Fit)' : ''}: Das schattierte Band zeigt nur das Fenster ${covers(what)}.`],
  [/^ AKI episode at the creatinine peak \(KDIGO creatinine criterion, automated screening\); an open diamond on the time axis marks a peak without a measurement of this parameter within (\d+) days\.$/,
    ' AKI-Episode am Kreatininmaximum (KDIGO-Kreatininkriterium, automatisches Screening); eine offene Raute auf der Zeitachse markiert ein Maximum ohne Messung dieses Parameters innerhalb von $1 Tagen.'],
  [/^ Shaded: AKI window after onset$/, ' Schattiert: AKI-Fenster nach Beginn'],
  [/^No AKI episodes detected for the plotted trajectories\.$/, 'Für die dargestellten Verläufe wurden keine AKI-Episoden erkannt.'],
  [/^AKI windows and episodes shown \((\d+) episodes\)$/, 'AKI-Fenster und -Episoden angezeigt ($1 Episoden)'],
  [/^AKI windows and episodes$/, 'AKI-Fenster und -Episoden'],
  [/^AKI window (\S+) d$/, 'AKI-Fenster $1 T'],
  [/^AKI windows shortened to (\S+) days? after each onset: with windows up to (\S+) days? after the end of each episode the fit would keep fewer than 3 fitted dates over at least 365 days\.$/,
    (_m, a, b) => `AKI-Fenster auf ${days(a)} nach jedem Beginn verkürzt: mit Fenstern bis ${days(b)} nach dem Ende jeder Episode behielte der Fit weniger als 3 angepasste Daten über mindestens 365 Tage.`],
  [/^(\d+) AKI (?:episode|episodes): (.+)$/, (_m, n, parts: string) => `${n} AKI-${one(n) ? 'Episode' : 'Episoden'}: ${parts.split(', ').map(stagePart).join(', ')}`],
  [/^Rapid decline: slope and its whole 95% interval < (\S+) \/year$/, 'Rasche Abnahme: Steigung und ihr gesamtes 95-%-Intervall < $1 /Jahr'],
  [/^Possible rapid decline: slope < (\S+) \/year, but its 95% interval reaches (\S+) or above$/, 'Mögliche rasche Abnahme: Steigung < $1 /Jahr, aber ihr 95-%-Intervall reicht bis $2 oder darüber'],
  [/^Possible rapid decline: slope < (\S+) \/year, no 95% interval to confirm it$/, 'Mögliche rasche Abnahme: Steigung < $1 /Jahr, kein 95-%-Intervall zur Bestätigung'],
  [/^rapid ↓(\??)$/, 'rasch ↓$1'],
]

export function coreText(text: string): string {
  if (getLanguage() === 'en') return text
  for (const [pattern, replacement] of RULES) if (pattern.test(text)) return text.replace(pattern, replacement as string)
  return tx(text)
}
