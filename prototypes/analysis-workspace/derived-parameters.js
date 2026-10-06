import { ckdEpi2021, mdrd4 } from '../../src/core/egfr/formulas.ts';

// Prototype session state. Source series remain untouched; every reader derives on demand.
const formulas = {
  ckdepi2021: { label: 'CKD-EPI 2021', compute: ckdEpi2021, source: 'Inker et al., 2021 · kreatininbasierte Gleichung ohne Ethnizitätsfaktor' },
  mdrd4: { label: 'MDRD-4 (IDMS)', compute: mdrd4, source: 'Levey et al., 2006 · IDMS-standardisiert, ohne Ethnizitätsfaktor' },
};
let applied = 'ckdepi2021';
let draft = null;
const boundRoots = new WeakSet();
const number = value => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const button = (label, action, primary = false) => `<button type="button" data-derived-action="${action}" class="${primary ? 'primary' : ''}">${label}</button>`;

export function derivePoints(patient, parameterKey) {
  if (parameterKey !== 'egfr') return null;
  if (!Number.isFinite(patient.baselineAge) || !['w', 'm'].includes(patient.sex)) return [];
  return (patient.values.creatinine ?? []).flatMap(point => {
    if (!Number.isFinite(point.time) || !Number.isFinite(point.value)) return [];
    const value = formulas[applied].compute({ scrMgdl: point.value, ageYears: patient.baselineAge + point.time, sex: patient.sex });
    return Number.isFinite(value) ? [{ time: point.time, value }] : [];
  });
}

export function getDerivedDefinition() {
  return { key: 'egfr', formula: applied, label: formulas[applied].label, unit: 'ml/min/1,73 m²' };
}

function dependencies() {
  return `<dl>
    <dt><strong>Quelle · fest im Demonstrator</strong></dt><dd>Synthetische Kreatininreihe · mg/dl · sechs Messzeitpunkte je Person</dd>
    <dt><strong>Abhängigkeiten · nur lesbar</strong></dt><dd>Alter bei erster Messung + Jahre seit erster Messung; Geschlecht (w/m). Keine Schätzung fehlender Angaben.</dd>
    <dt><strong>Ausgabe</strong></dt><dd>Abgeleitete eGFR-Zeitreihe · ml/min/1,73 m² · nur für Erwachsene ab 18 Jahren</dd>
  </dl>`;
}

function preview() {
  const example = { scrMgdl: 1, ageYears: 60, sex: 'w' };
  return `<p class="eyebrow">Vorschau · noch nicht übernommen</p>
    <p><strong>${formulas[draft].label}</strong> · ${formulas[draft].source}</p>
    <div class="table-scroll"><table><caption>Separates synthetisches Rechenbeispiel: Kreatinin 1 mg/dl, Alter 60 Jahre, Geschlecht w</caption>
      <thead><tr><th scope="col">Aktuell: ${formulas[applied].label}</th><th scope="col">Entwurf: ${formulas[draft].label}</th></tr></thead>
      <tbody><tr><td>${number(formulas[applied].compute(example))} ml/min/1,73 m²</td><td>${number(formulas[draft].compute(example))} ml/min/1,73 m²</td></tr></tbody>
    </table></div>
    <p class="notice">Im festen Beispieldatensatz bleiben 276 Werte für 46 Personen berechenbar. Bei 047 und 048 fehlen Altersangaben: jeweils sechs eGFR-Werte sind nicht verfügbar.</p>
    <p class="subtext">Übernehmen aktualisiert die eGFR-Reihen und ihre optionalen Auswertungen in der Personenansicht. Andere Messreihen bleiben unverändert. Die Gruppenanalyse zeigt weiterhin ihre ausdrücklich illustrativen Trends.</p>`;
}

export function derivedPanel() {
  return `<section class="card" data-derived-panel aria-labelledby="derived-heading" style="margin-top:22px">
    <div class="card-header"><div><p class="eyebrow">Datenaufbereitung</p><h2 id="derived-heading">Abgeleitete Parameter</h2></div>${button('Definition bearbeiten', 'edit')}</div>
    <p><strong>eGFR</strong> <span class="badge">Abgeleitete Zeitreihe</span> · <span data-derived-current>${formulas[applied].label}</span> · ml/min/1,73 m²</p>
    <p class="muted">Aus Kreatinin, Alter und Geschlecht berechnet. Eine zentrale Definition für alle eGFR-Verläufe in der Personenansicht.</p>
    <p class="subtext">Feste synthetische Beispieldaten: 276 berechenbare Werte · 46 Personen. Bei 047 und 048 fehlen Altersangaben; 12 eGFR-Werte sind nicht verfügbar.</p>
    <details><summary>Herkunft und Abhängigkeiten</summary>${dependencies()}<p class="subtext">Formel: ${formulas[applied].source}. Berechnung mit den vorhandenen numerischen Funktionen der Anwendung. Definition gilt nur für diese Browsersitzung.</p></details>
    <dialog data-derived-dialog aria-labelledby="derived-dialog-heading">
      <h2 id="derived-dialog-heading">eGFR-Definition bearbeiten</h2>
      <p class="muted">Wähle eine der zwei vorhandenen Formeln. Prüfe die Vorschau, bevor du sie für die Personenansicht übernimmst.</p>
      <label class="field">Berechnungsformel<select data-derived-formula aria-label="Berechnungsformel für eGFR">${Object.entries(formulas).map(([key, formula]) => `<option value="${key}" ${key === applied ? 'selected' : ''}>${formula.label}</option>`).join('')}</select></label>
      <details><summary>Quelle, Einheiten und benötigte Angaben</summary>${dependencies()}</details>
      <div data-derived-preview role="status" aria-live="polite"></div>
      <p class="subtext">Dieser Demonstrator bietet eine Formelauswahl; freie Formeln und die Bearbeitung der Quelldaten sind hier nicht verfügbar.</p>
      <div class="actions picker-footer">${button('Abbrechen', 'cancel')}${button('Vorschau prüfen', 'preview')}${button('Übernehmen', 'apply', true)}</div>
    </dialog>
  </section>`;
}

export function bindDerived(root, render) {
  if (boundRoots.has(root)) return;
  boundRoots.add(root);
  root.addEventListener('click', event => {
    const trigger = event.target.closest('[data-derived-action]');
    if (!trigger || !root.contains(trigger)) return;
    const dialog = root.querySelector('[data-derived-dialog]');
    if (!dialog) return;
    const applyButton = dialog.querySelector('[data-derived-action="apply"]');
    const action = trigger.dataset.derivedAction;
    if (action === 'edit') {
      draft = applied;
      dialog.querySelector('[data-derived-formula]').value = draft;
      dialog.querySelector('[data-derived-preview]').innerHTML = '<p class="subtext">Vorschau prüfen, um die Berechnung vor dem Übernehmen zu vergleichen.</p>';
      applyButton.disabled = true;
      dialog.showModal();
      dialog.querySelector('[data-derived-formula]').focus();
    } else if (action === 'cancel') {
      draft = null;
      dialog.close();
      root.querySelector('[data-derived-action="edit"]')?.focus();
    } else if (action === 'preview' && draft in formulas) {
      dialog.querySelector('[data-derived-preview]').innerHTML = preview();
      applyButton.disabled = draft === applied;
    } else if (action === 'apply' && !applyButton.disabled && draft in formulas) {
      applied = draft;
      draft = null;
      dialog.close();
      render();
      root.querySelector('[data-derived-action="edit"]')?.focus();
    }
  });
  root.addEventListener('change', event => {
    if (!event.target.matches('[data-derived-formula]')) return;
    draft = Object.hasOwn(formulas, event.target.value) ? event.target.value : null;
    const dialog = event.target.closest('[data-derived-dialog]');
    dialog.querySelector('[data-derived-action="apply"]').disabled = true;
    dialog.querySelector('[data-derived-preview]').innerHTML = '<p class="subtext">Entwurf geändert. Bitte die Vorschau erneut prüfen.</p>';
  });
  root.addEventListener('cancel', event => {
    if (event.target.matches('[data-derived-dialog]')) draft = null;
  }, true);
}
