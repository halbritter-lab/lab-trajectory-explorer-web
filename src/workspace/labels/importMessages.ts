/**
 * Import findings as the interface shows them (issue #71). The import
 * composes its findings in English (`src/core/parse`, `src/io`); they are
 * stored with a saved copy and written unchanged to the `import_diagnostics`
 * export. In German the page translates the known sentence patterns here,
 * fragment by fragment, so a finding composed of several parts (a date
 * problem inside a rejection) is translated as a whole. Imported names,
 * values, codes and units inside a finding stay as they are. A finding no
 * pattern matches is shown in English.
 */
import { getLanguage } from '../../i18n'

type Replacement = string | ((...groups: string[]) => string)
const one = (n: string) => n === '1'
const LABEL: Record<string, [string, string]> = {
  'lab date': ['Labordatum', 'Labordaten'], 'birth date': ['Geburtsdatum', 'Geburtsdaten'], 'event date': ['Ereignisdatum', 'Ereignisdaten'],
}
const label = (subject: string, n: string) => (LABEL[subject] ?? [subject, subject])[one(n) ? 0 : 1]
const testName = (name: string) => name === 'No test name' ? 'Kein Testname' : name

/** Whole sentences first, then the fragments they share. */
const RULES: Array<[RegExp, Replacement]> = [
  [/^Patient ID missing; row not imported\.$/, 'Patienten-ID fehlt; Zeile nicht importiert.'],
  [/^Patient (.+) already has an attribute row; this later row is not imported\.$/, 'Patient $1 hat bereits eine Attributzeile; diese spätere Zeile wird nicht importiert.'],
  [/^Patient (.+) has no lab values in this dataset; the event is kept\.$/, 'Patient $1 hat keine Laborwerte in diesem Datensatz; das Ereignis bleibt erhalten.'],
  [/^Patient (.+) has no lab values in this dataset; the attributes are kept\.$/, 'Patient $1 hat keine Laborwerte in diesem Datensatz; die Attribute bleiben erhalten.'],
  [/^Dialysis intent is missing or "unknown"; the event is kept with unknown intent\.$/, 'Die Dialyseintention fehlt oder ist „unknown“; das Ereignis bleibt mit unbekannter Intention erhalten.'],
  [/^Acute dialysis without an end date; no interval is excluded from fits\.$/, 'Akute Dialyse ohne Enddatum; kein Intervall wird von Fits ausgeschlossen.'],
  [/^Patient (.+) has lab values dated after this death \((.+)\), which suggests a data error; they are shown, but endpoints and the time-to-event analysis leave them out\.$/,
    'Patient $1 hat Laborwerte, die nach diesem Tod ($2) datiert sind, was auf einen Datenfehler hindeutet; sie werden angezeigt, aber Endpunkte und die Ereigniszeitanalyse lassen sie aus.'],
  [/^Patient (.+) has an earlier death event; only the earliest is used\.$/, 'Patient $1 hat ein früheres Todesereignis; nur das früheste wird verwendet.'],
  [/^Required (value|values) missing \((.+)\); row not imported\.$/, (_m, n, list) => `${n === 'value' ? 'Pflichtwert fehlt' : 'Pflichtwerte fehlen'} (${list}); Zeile nicht importiert.`],
  [/^Event type "(.*)" is not one of (.+) \(death also as (.+)\); row not imported\.$/, 'Ereignistyp „$1“ ist keiner von $2 (Tod auch als $3); Zeile nicht importiert.'],
  [/^Dialysis intent "(.*)" is not one of (.+); row not imported\.$/, 'Dialyseintention „$1“ ist keine von $2; Zeile nicht importiert.'],
  [/^Intent "(.*)" is only allowed for dialysis events; row not imported\.$/, 'Intention „$1“ ist nur für Dialyseereignisse erlaubt; Zeile nicht importiert.'],
  [/^A kidney transplant cannot have an end date \((.+)\); row not imported\.$/, 'Eine Nierentransplantation kann kein Enddatum haben ($1); Zeile nicht importiert.'],
  [/^A death cannot have an end date \((.+)\); row not imported\.$/, 'Ein Tod kann kein Enddatum haben ($1); Zeile nicht importiert.'],
  [/^End date (\S+) is before the event date (\S+); row not imported\.$/, 'Enddatum $1 liegt vor dem Ereignisdatum $2; Zeile nicht importiert.'],
  [/^Legacy annotation schema is no longer supported; use patientId, type, date, title\.$/, 'Das frühere Annotationsschema wird nicht mehr unterstützt; verwenden Sie patientId, type, date, title.'],
  [/^Implausible (.+); the event is used unchanged\.$/, (_m, found: string) => `Unplausibles ${found.replace(/\bevent date /g, 'Ereignisdatum ').replace(/\bend date /g, 'Enddatum ').replace(/ and /g, ' und ')}; das Ereignis wird unverändert verwendet.`],
  [/^Birth date (\S+) is after the import day (\S+); it is used unchanged\.$/, 'Geburtsdatum $1 liegt nach dem Importtag $2; es wird unverändert verwendet.'],
  [/^(\d+) (lab date|birth date|event date)s? written as DD\/MM\/YYYY (?:was|were) read day-first \(03\/01\/2024 = 3 January 2024\)\.$/,
    (_m, n, subject) => `${n} als TT/MM/JJJJ geschriebene${one(n) ? 's' : ''} ${label(subject, n)} ${one(n) ? 'wurde' : 'wurden'} mit dem Tag zuerst gelesen (03/01/2024 = 3. Januar 2024).`],
  [/^(\d+) (lab date|birth date|event date)s? stored as (?:a number|numbers) (?:was|were) read as (?:an )?Excel serial dates? \(1900 date system\)\.$/,
    (_m, n, subject) => `${n} als Zahl gespeicherte${one(n) ? 's' : ''} ${label(subject, n)} ${one(n) ? 'wurde' : 'wurden'} als Excel-Seriendatum gelesen (1900-Datumssystem).`],
  [/^(.*): unit spellings (.+) were merged as "(.*)"\.$/, (_m, name, spellings, unit) => `${testName(name)}: Einheitenschreibweisen ${spellings} wurden als „${unit}“ zusammengeführt.`],
  [/^(.*): (\d+) values? with LOINC code (\S+) (?:was|were) imported as the separate parameter "(.*)"; the code marks creatinine that is not from serum, so it is not used for AKI detection or eGFR\.$/,
    (_m, name, n, code, parameter) => `${testName(name)}: ${n} ${one(n) ? 'Wert' : 'Werte'} mit LOINC-Code ${code === 'none' ? 'keiner' : code} ${one(n) ? 'wurde' : 'wurden'} als eigener Parameter „${parameter}“ importiert; der Code kennzeichnet Kreatinin, das nicht aus dem Serum stammt, daher wird es nicht für AKI-Erkennung oder eGFR verwendet.`],
  [/^(\d+) lab rows? with an implausible lab date: (.+?)(?: and (\d+) more dates?)?; the rows? (?:is|are) used unchanged\.$/,
    (_m, n, dates, more) => `${n} ${one(n) ? 'Laborzeile' : 'Laborzeilen'} mit unplausiblem Labordatum: ${dates}${more ? ` und ${more} ${one(more) ? 'weiteres Datum' : 'weitere Daten'}` : ''}; ${one(n) ? 'die Zeile wird' : 'die Zeilen werden'} unverändert verwendet.`],
  [/^1 value with three digits after a comma, "(.*)", was read as a decimal \((.*)\); check that the comma is not a thousands separator\.$/,
    '1 Wert mit drei Ziffern nach einem Komma, „$1“, wurde als Dezimalzahl gelesen ($2); prüfen Sie, dass das Komma kein Tausendertrennzeichen ist.'],
  [/^(\d+) values with three digits after a comma, such as "(.*)", were read as decimals \((.*)\); check that the comma is not a thousands separator\.$/,
    '$1 Werte mit drei Ziffern nach einem Komma, etwa „$2“, wurden als Dezimalzahlen gelesen ($3); prüfen Sie, dass das Komma kein Tausendertrennzeichen ist.'],
  [/^1 value with three digits after a point, "(.*)", was read as a decimal; check that the point is not a thousands separator\.$/,
    '1 Wert mit drei Ziffern nach einem Punkt, „$1“, wurde als Dezimalzahl gelesen; prüfen Sie, dass der Punkt kein Tausendertrennzeichen ist.'],
  [/^(\d+) values with three digits after a point, such as "(.*)", were read as decimals; check that the point is not a thousands separator\.$/,
    '$1 Werte mit drei Ziffern nach einem Punkt, etwa „$2“, wurden als Dezimalzahlen gelesen; prüfen Sie, dass der Punkt kein Tausendertrennzeichen ist.'],
  [/^(\d+) duplicate lab rows? \(same patient, date, test, unit and value\) for (\d+) patients?; (?:it is|they are) kept and counted as separate measurements\.$/,
    (_m, n, p) => `${n} ${one(n) ? 'doppelte Laborzeile' : 'doppelte Laborzeilen'} (gleicher Patient, gleiches Datum, gleicher Test, gleiche Einheit und gleicher Wert) bei ${p} ${one(p) ? 'Patient' : 'Patienten'}; ${one(n) ? 'sie bleibt' : 'sie bleiben'} erhalten und ${one(n) ? 'zählt' : 'zählen'} als getrennte Messungen.`],
  [/^(.*): (\d+) patient-days? with differing values on the same day for (\d+) patients?; all values are kept and each counts as a separate measurement\.$/,
    (_m, name, n, p) => `${name}: ${n} ${one(n) ? 'Patiententag' : 'Patiententage'} mit unterschiedlichen Werten am selben Tag bei ${p} ${one(p) ? 'Patient' : 'Patienten'}; alle Werte bleiben erhalten, und jeder zählt als eigene Messung.`],
  [/^(.*): (\d+) LOINC codes in one parameter: (.+)\. The values stay one series; check that they are the same test and material\.$/,
    (_m, name, n, codes: string) => `${name}: ${n} LOINC-Codes in einem Parameter: ${codes.replace(/\((\d+) values?\)/g, (_v, k: string) => `(${k} ${one(k) ? 'Wert' : 'Werte'})`)}. Die Werte bleiben eine Reihe; prüfen Sie, dass es derselbe Test und dasselbe Material sind.`],
  [/^(.*): (\d+) censored values? \((.+)\); retained for display and raw counts; in fits as the bounded-values setting of the column says \(at the limit by default, at half the limit or excluded\); excluded from endpoints, AKI detection and mixed models\.$/,
    (_m, name, n, parts) => `${name}: ${n} ${one(n) ? 'zensierter Wert' : 'zensierte Werte'} (${parts}); für die Anzeige und die Rohzählungen behalten; in Fits so, wie es die Einstellung für Grenzwerte der Spalte vorgibt (standardmäßig an der Grenze, bei der halben Grenze oder ausgeschlossen); ausgeschlossen von Endpunkten, AKI-Erkennung und gemischten Modellen.`],
  [/^Unreadable sex (value|values): (.+?)(?: and (\d+) more)?; read as no sex\. Accepted: m \/ male \/ männlich, w \/ f \/ female \/ weiblich, d \/ divers\. Correct the source file, supply the sex in the attributes table or enter it under Review and edit patients\.$/,
    (_m, n, named: string, more) => `${n === 'value' ? 'Unlesbarer Geschlechtswert' : 'Unlesbare Geschlechtswerte'}: ${named.replace(/\((\d+) rows?, (\d+) patients?\)/g, (_v, r: string, p: string) => `(${r} ${one(r) ? 'Zeile' : 'Zeilen'}, ${p} ${one(p) ? 'Patient' : 'Patienten'})`)}${more ? ` und ${more} weitere` : ''}; als kein Geschlecht gelesen. Akzeptiert: m / male / männlich, w / f / female / weiblich, d / divers. Korrigieren Sie die Quelldatei, geben Sie das Geschlecht in der Attributtabelle an oder tragen Sie es unter „Patienten prüfen und bearbeiten“ ein.`],
  [/^Patient IDs (.+) differ only in leading zeros, spaces or letter case and are kept as separate patients\. Check whether they are the same patient\.$/,
    (_m, ids: string) => `Die Patienten-IDs ${ids.replace(/" and "/g, '" und "')} unterscheiden sich nur in führenden Nullen, Leerzeichen oder Groß- und Kleinschreibung und bleiben getrennte Patienten. Prüfen Sie, ob es derselbe Patient ist.`],
  [/^Columns "(.+?)" and (.+) hold the same field; "(.+?)" is used and (.+) (is|are) ignored\.$/,
    (_m, used, others, _used, ignored, verb) => `Die Spalten „${used}“ und ${others} enthalten dasselbe Feld; „${used}“ wird verwendet, ${ignored} ${verb === 'is' ? 'wird' : 'werden'} ignoriert.`],
  [/^Ambiguous columns: "(.*)" and "(.*)" are read as the same column\. Rename one of them\.$/, 'Mehrdeutige Spalten: „$1“ und „$2“ werden als dieselbe Spalte gelesen. Benennen Sie eine davon um.'],
  // Date problems (`describeDateProblem`) inside a rejection or a warning.
  [/^(Lab date|Birth date|Event date|End date) /, (_m, name) => `${{ 'Lab date': 'Labordatum', 'Birth date': 'Geburtsdatum', 'Event date': 'Ereignisdatum', 'End date': 'Enddatum' }[name]} `],
  [/^Event date is not a valid date/, 'Ereignisdatum ist kein gültiges Datum'],
  [/ is not a valid calendar date/, ' ist kein gültiges Kalenderdatum'],
  [/ is not a valid date: dates with slashes are read day-first \(DD\/MM\/YYYY\); US month-first dates are not supported/,
    ' ist kein gültiges Datum: Daten mit Schrägstrichen werden mit dem Tag zuerst gelesen (TT/MM/JJJJ); US-Daten mit dem Monat zuerst werden nicht unterstützt'],
  [/ is a number outside the accepted Excel date range \((.+?)–(.+?), years (.+?)\)/, ' ist eine Zahl außerhalb des akzeptierten Excel-Datumsbereichs ($1–$2, Jahre $3)'],
  [/ is Excel's serial number for 29 February 1900, a day that does not exist/, ' ist die Excel-Seriennummer für den 29. Februar 1900, einen Tag, den es nicht gibt'],
  [/ is a number that looks like a year, not an Excel date/, ' ist eine Zahl, die wie eine Jahreszahl aussieht, kein Excel-Datum'],
  [/ is not a recognised date \(use YYYY-MM-DD, DD\.MM\.YYYY or DD\/MM\/YYYY\)/, ' ist kein erkanntes Datum (verwenden Sie JJJJ-MM-TT, TT.MM.JJJJ oder TT/MM/JJJJ)'],
  [/; row not imported\.$/, '; Zeile nicht importiert.'],
  [/; it is ignored\.$/, '; es wird ignoriert.'],
  [/\(after the import day (\S+)\)/g, '(nach dem Importtag $1)'],
  [/\(before (\S+)\)/g, '(vor $1)'],
]

export function importMessage(reason: string): string {
  if (getLanguage() === 'en') return reason
  let text = reason
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement as string)
  return text
}
