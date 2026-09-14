import { overlayView, bindOverlay } from './overlay-view.js';
import { derivePoints, getDerivedDefinition } from './derived-parameters.js';
import { bindPresets } from './evaluation-presets.js';
import { evaluationMethods, getPresets, getEvaluation, setEvaluation, validEvaluation, evaluateSeries, evaluationValues } from './series-evaluations.js';
// Synthetic data for UI review. Optional series evaluations reuse existing numeric functions.
const parameters = [
  { key: 'egfr', name: 'eGFR', unit: 'ml/min/1,73 m²', min: 0, max: 120, color: '#176c68' },
  { key: 'creatinine', name: 'Kreatinin', unit: 'mg/dl', min: 0, max: 4, color: '#487ca9' },
  { key: 'hemoglobin', name: 'Hämoglobin', unit: 'g/dl', min: 8, max: 18, color: '#9d5d72' },
  { key: 'crp', name: 'CRP', unit: 'mg/l', min: 0, max: 60, color: '#ac792b' },
  { key: 'sodium', name: 'Natrium', unit: 'mmol/l', min: 120, max: 160, color: '#487ca9' },
  { key: 'potassium', name: 'Kalium', unit: 'mmol/l', min: 2, max: 7, color: '#9d5d72' },
  { key: 'calcium', name: 'Calcium', unit: 'mmol/l', min: 1.5, max: 3, color: '#176c68' },
  { key: 'phosphate', name: 'Phosphat', unit: 'mmol/l', min: 0, max: 3, color: '#ac792b' },
  { key: 'albumin', name: 'Albumin', unit: 'g/l', min: 20, max: 55, color: '#487ca9' },
  { key: 'glucose', name: 'Glukose', unit: 'mg/dl', min: 60, max: 200, color: '#9d5d72' },
  { key: 'alt', name: 'ALT', unit: 'U/l', min: 0, max: 100, color: '#176c68' },
  { key: 'platelets', name: 'Thrombozyten', unit: 'G/l', min: 100, max: 450, color: '#ac792b' },
];
const patients = Array.from({ length: 48 }, (_, index) => ({
  id: String(index + 1).padStart(3, '0'),
  group: index % 2 ? 'B' : 'A',
  baselineAge: index>=46 ? null : 40+index%20,
  sex: index%2 ? 'm' : 'w',
  baselineDate: `${2015+index%6}-01-01`,
  values: Object.fromEntries(parameters.map((parameter, p) => [parameter.key,
    Array.from({ length: 6 }, (_, t) => {
      const wave = Math.sin(index * 1.7 + t * 1.3);
      const value = p === 0 ? 90 - index % 13 * 3 - t * (index % 5 + 1) + wave * 3
        : p === 1 ? 0.8 + index % 9 * 0.12 + t * (index % 5) * 0.07 + wave * 0.06
          : p === 2 ? 15 - index % 6 * 0.5 - t * ((index % 3) - 1) * 0.22 + wave * 0.3
            : p === 3 ? 5 + index % 7 + (t === index % 6 ? 15 + index % 25 : 0) + wave * 2
              : parameter.min + (parameter.max - parameter.min) * (0.45 + wave * 0.15 + (index % 5 - 2) * 0.04);
      return { time: t, value };
    })])),
}));
const browser = { selected: ['egfr', 'hemoglobin', 'crp'], query: '', group: 'all', sort: 'id', patient: null, horizontal: 0, mode: 'table', patientScope:'all', patientIds:[] };
let draft = [];
let parameterQuery = '';
let evaluationKey = null;
let evaluationDraft = null;
let patientDraft = [];
const columnWidth = 285;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = value => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const action = (label, name, disabled = false) => `<button type="button" data-browser-action="${name}" ${disabled ? 'disabled' : ''}>${label}</button>`;
function series(patient,key) { return derivePoints(patient,key) ?? patient.values[key]; }
function seriesSummary(patient,key,parameter) { const points=series(patient,key); return points.length ? `${number(points[0].value)} → ${number(points.at(-1).value)} ${parameter.unit}` : 'Nicht berechenbar: Ausgangsalter fehlt'; }
function filtered() {
  const rows = patients.filter(patient => (browser.patientScope==='all'||browser.patientIds.includes(patient.id)) && patient.id.includes(browser.query.trim()) && (browser.group === 'all' || patient.group === browser.group));
  if (browser.sort !== 'id') rows.sort((a, b) => (series(b,browser.sort).at(-1)?.value??-Infinity) - (series(a,browser.sort).at(-1)?.value??-Infinity));
  return rows;
}
function plot(patient, parameter, large = false) {
  const width = large ? 550 : 245, height = large ? 215 : 94;
  const left = large ? 38 : 30, right = width - 12, top = 12, bottom = height - 24;
  const x = time => left + time / 5 * (right - left);
  const y = value => bottom - (value - parameter.min) / (parameter.max - parameter.min) * (bottom - top);
  const points = series(patient,parameter.key);
  if(!points.length)return '<p class="notice">Keine berechenbaren Werte: Ausgangsalter fehlt. Siehe Daten → abgeleitete Messgrößen.</p>';
  const {config,fit} = evaluateSeries(points,parameter);
  const clipId = `series-clip-${patient.id}-${parameter.key}`;
  const trend = config.features.includes('trend') && Number.isFinite(fit.slope) && Number.isFinite(fit.intercept);
  const threshold = config.features.includes('projection') && Number.isFinite(config.threshold) && config.threshold >= parameter.min && config.threshold <= parameter.max;
  return `<svg class="patient-plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="Person ${patient.id}, ${parameter.name}, ${parameter.unit}, sechs illustrative Messungen über fünf Jahre: ${points.map(point => `Jahr ${point.time}: ${number(point.value)} ${parameter.unit}`).join('; ')}">
    ${[parameter.min, (parameter.min + parameter.max) / 2, parameter.max].map(v => `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="#e5eaed"/><text x="${left - 5}" y="${y(v) + 3}" text-anchor="end">${number(v)}</text>`).join('')}
    <polyline points="${points.map(point => `${x(point.time)},${y(point.value)}`).join(' ')}" fill="none" stroke="${parameter.color}" stroke-width="2"/>
    <defs><clipPath id="${clipId}"><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}"/></clipPath></defs>
    ${trend?`<path data-series-trend d="M${x(Math.max(0,config.from))} ${y(fit.intercept+fit.slope*Math.max(0,config.from))} L${x(Math.min(5,config.to))} ${y(fit.intercept+fit.slope*Math.min(5,config.to))}" stroke="#233746" stroke-dasharray="5 3" stroke-width="2" fill="none" clip-path="url(#${clipId})"/>`:''}
    ${threshold?`<line data-series-threshold x1="${left}" x2="${right}" y1="${y(config.threshold)}" y2="${y(config.threshold)}" stroke="#ac792b" stroke-dasharray="3 3"/>`:''}
    ${points.map(point => `<circle cx="${x(point.time)}" cy="${y(point.value)}" r="${large ? 3 : 2}" fill="${parameter.color}"/>`).join('')}
    ${[0, 5].map(t => `<text x="${x(t)}" y="${height - 6}" text-anchor="middle">${t} J.</text>`).join('')}
  </svg>`;
}
function evaluationButton(parameter) {
  const count = getEvaluation(parameter.key).features.length;
  return `<button type="button" class="small" data-browser-action="evaluations" data-parameter="${parameter.key}" aria-label="${parameter.name}: Anzeige">Anzeige${count?` (${count})`:''}</button>`;
}
function evaluationPicker(parameter) {
  const config = evaluationDraft;
  return `<dialog id="evaluation-dialog" aria-labelledby="evaluation-title"><h2 id="evaluation-title">${parameter.name}: Anzeige</h2><label class="field">Auswertungskonfiguration<select data-evaluation-field="presetId">${getPresets().map(p=>`<option value="${p.id}" ${config.presetId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><p class="muted">Dieselbe Konfiguration gilt für diesen Parameter in Tabelle, Einzelansicht und Überlagerung.</p><fieldset class="evaluation-methods"><legend>Sichtbare Ergebnisse</legend>${evaluationMethods.map(method=>`<label><input type="checkbox" data-evaluation-feature="${method.key}" ${config.features.includes(method.key)?'checked':''}>${method.label}</label>`).join('')}</fieldset><p class="subtext">Modell, Zeitfenster und Grenzwerte pflegst du zentral über „Konfigurationen verwalten“. Die Überlagerung zeigt Linien; Kennzahlen stehen bei den einzelnen Verläufen.</p><p id="evaluation-error" role="status"></p><div class="actions picker-footer">${action('Abbrechen','cancel-evaluation')}${action('Übernehmen','apply-evaluation')}</div></dialog>`;
}
function parameterControls() {
  const names = browser.selected.map(key => parameters.find(p => p.key === key).name);
  return `<div class="parameter-summary"><div><strong>${names.length} Parameter ausgewählt</strong><p class="subtext">${names.slice(0, 3).join(' · ')}${names.length > 3 ? ` · +${names.length - 3} weitere` : ''}</p>${browser.selected.includes('egfr')?`<p class="subtext">eGFR abgeleitet · ${getDerivedDefinition().label} · Definition unter Daten</p>`:''}</div><div class="actions">${action('Parameter auswählen …', 'parameters')}<button data-preset-action="open">Konfigurationen verwalten</button></div></div>`;
}
function parameterOptions() {
  const options = parameters.filter(p => `${p.name} ${p.unit}`.toLocaleLowerCase('de').includes(parameterQuery.toLocaleLowerCase('de')));
  return options.length ? options.map(p => `<label class="parameter-option"><input type="checkbox" data-browser-parameter="${p.key}" ${draft.includes(p.key) ? 'checked' : ''}><span>${p.name}</span><span class="subtext">${p.unit}</span></label>`).join('') : '<p class="muted">Keine passenden Parameter.</p>';
}
function picker() {
  return `<dialog id="parameter-dialog" aria-labelledby="parameter-title"><h2 id="parameter-title">Parameter auswählen</h2><p class="muted">Ausgewählte Parameter erscheinen als Spalten. Die Graphen behalten ihre Breite; weitere Spalten sind horizontal erreichbar.</p><label class="field">Parameter suchen<input type="search" data-browser-field="parameter-query" placeholder="Name oder Einheit" autocomplete="off"></label><div class="actions">${action('Alle auswählen', 'all-parameters')}${action('Auswahl leeren', 'no-parameters')}<span id="parameter-count" role="status">${draft.length} ausgewählt</span></div><fieldset class="parameter-options"><legend class="sr-only">Verfügbare Parameter</legend><div id="parameter-options">${parameterOptions()}</div></fieldset><div class="actions picker-footer">${action('Abbrechen', 'cancel-parameters')}${action('Auswahl übernehmen', 'apply-parameters')}</div></dialog>`;
}
function patientDetail(rows) {
  const index = rows.findIndex(patient => patient.id === browser.patient);
  const patient = rows[index];
  if (!patient) { browser.patient = null; return table(rows); }
  return `<div class="patient-toolbar"><div class="actions">${action(browser.mode==='overlay'?'← Zur Überlagerung':'← Zur Tabelle', 'back')}${action('← Vorherige Person', 'previous', index === 0)}${action('Nächste Person →', 'next', index === rows.length - 1)}</div><span class="muted">${index + 1} von ${rows.length} in der aktuellen Auswahl</span></div>
    <div class="page-heading"><div><p class="eyebrow">Patientenansicht</p><h2>Person ${patient.id}</h2><p class="muted">Genotyp ${patient.group} · 6 Zeitpunkte · gleiche Zeitachse für alle Parameter</p></div><label class="field">Direkt zu Person<select data-browser-field="patient" aria-label="Direkt zu Person">${rows.map(row => `<option ${row.id === patient.id ? 'selected' : ''}>${row.id}</option>`).join('')}</select></label></div>
    ${browser.selected.length ? `<div class="patient-detail-grid">${browser.selected.map(key => { const parameter = parameters.find(p => p.key === key); return `<section class="card"><div class="card-header"><h3>${parameter.name} <span class="muted">${parameter.unit}</span></h3>${evaluationButton(parameter)}</div>${plot(patient, parameter, true)}${evaluationValues(series(patient,key), parameter)}<p class="subtext">${seriesSummary(patient,key,parameter)}</p></section>`; }).join('')}</div>` : '<p class="notice">Wähle oben mindestens einen Parameter für die Verlaufsansicht.</p>'}`;
}
function table(rows) {

  return `<div class="patient-toolbar"><div><h2>Patientenübersicht</h2><span class="muted">${rows.length} von 48 Personen · Personen-ID öffnen zum Durchblättern</span></div></div>
    ${!rows.length ? '<div class="empty"><h2>Keine passenden Personen</h2><p class="muted">Suche oder Gruppenfilter ändern.</p></div>' : !browser.selected.length ? '<p class="notice">Wähle oben mindestens einen Parameter für die Vergleichstabelle.</p>' : `<div class="column-navigation"><span class="subtext">${browser.selected.length} Parameterspalten · horizontal vergleichen</span><div class="actions">${action('← Spalten', 'columns-left')}${action('Spalten →', 'columns-right')}<label class="sr-only" for="column-jump">Zu Parameter springen</label><select id="column-jump" data-browser-field="column-jump"><option value="">Zu Parameter …</option>${browser.selected.map(key => `<option value="${key}">${parameters.find(p => p.key === key).name}</option>`).join('')}</select></div></div><div class="patient-table-scroll" tabindex="0" role="region" aria-label="Patiententabelle mit vergleichbaren Verlaufsgrafiken"><table class="patient-table" style="width:${115 + browser.selected.length * columnWidth}px"><thead><tr><th scope="col">Person</th>${browser.selected.map(key => { const parameter = parameters.find(p => p.key === key); return `<th scope="col">${parameter.name}<span class="subtext">${parameter.unit}</span>${evaluationButton(parameter)}</th>`; }).join('')}</tr></thead><tbody>${rows.map(patient => `<tr><th scope="row"><button class="table-link" data-browser-patient="${patient.id}" aria-label="Person ${patient.id} öffnen">${patient.id} ↗</button><span class="subtext">Genotyp ${patient.group}</span></th>${browser.selected.map(key => { const parameter = parameters.find(p => p.key === key); return `<td><span class="cell-parameter" aria-hidden="true">${parameter.name}</span>${plot(patient, parameter)}${evaluationValues(series(patient,key), parameter)}<span class="cell-summary">${seriesSummary(patient,key,parameter)}</span></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`}`;
}
function overlay(rows) { return overlayView(rows,browser.selected,parameters,series,evaluationButton); }
function browserResults(rows) { return browser.patient ? patientDetail(rows) : browser.mode==='overlay' ? overlay(rows) : table(rows); }
export function patientBrowser() {
  const rows = filtered();
  return `<div class="page-heading"><div><p class="eyebrow">02 / Verläufe</p><h1>Patienten und Parameter erkunden</h1><p class="muted">Verläufe über Personen hinweg vergleichen und mehrere Messgrößen gemeinsam betrachten.</p></div></div>
    <div class="card browser-controls"><div class="browser-filters"><label class="field">Person suchen<input type="search" data-browser-field="query" value="${esc(browser.query)}" placeholder="z. B. 012" autocomplete="off"></label><label class="field">Genotyp filtern<select data-browser-field="group"><option value="all">Alle Gruppen</option>${['A', 'B'].map(group => `<option value="${group}" ${browser.group === group ? 'selected' : ''}>Genotyp ${group}</option>`).join('')}</select></label><label class="field">Sortieren nach<select data-browser-field="sort"><option value="id">Personen-ID</option>${browser.selected.map(key => { const parameter = parameters.find(p => p.key === key); return `<option value="${key}" ${browser.sort === key ? 'selected' : ''}>${parameter.name}: letzter Wert ↓</option>`; }).join('')}</select></label></div>${parameterControls()}<div class="patient-scope"><label class="field">Patientenauswahl<select data-browser-field="patientScope"><option value="all" ${browser.patientScope==='all'?'selected':''}>Alle 48 Personen</option><option value="selected" ${browser.patientScope==='selected'?'selected':''}>Auswahl (${browser.patientIds.length} Personen)</option></select></label>${action('Patienten auswählen …','patient-picker')}<p class="subtext">Gilt für Tabelle und Überlagerung; Suche und Genotypfilter grenzen zusätzlich ein.</p></div></div>
    <p class="browser-scale-note">Feste Werteskala je Parameter · unterschiedliche Einheiten separat. Tabelle und Einzelansicht: Jahre seit erster Messung; die Überlagerung bietet zusätzliche Zeitachsen.</p>
    <div class="browser-view-switch" role="group" aria-label="Verlaufsdarstellung"><button data-browser-action="mode-table" aria-pressed="${browser.mode==='table'}">Tabelle</button><button data-browser-action="mode-overlay" aria-pressed="${browser.mode==='overlay'}">Überlagerung (Spaghetti-Plot)</button></div><div id="patient-browser-results">${browserResults(rows)}</div>
    <p class="chart-note">Synthetische Beispielverläufe · verbundene Messpunkte. Optionale OLS-Auswertungen werden je Einzelverlauf aus diesen Beispieldaten berechnet. Die Parameterliste steht beispielhaft für die später aus den Daten verfügbaren Messgrößen.</p>`;
}
export function restorePatientBrowser(root) {
  const table = root.querySelector('.patient-table-scroll');
  if (table) { table.scrollLeft = browser.horizontal; browser.horizontal = table.scrollLeft; }
}
export function bindPatientBrowser(root, render) {
  bindPresets(root,render,parameters);
  bindOverlay(root,render);
  root.addEventListener('keydown',event=>{ if(event.target.matches('polyline[data-browser-patient],circle[data-browser-patient]') && ['Enter',' '].includes(event.key)){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));} });
  function restoreHorizontal() { restorePatientBrowser(root); }
  function redraw(selector) { render(); restoreHorizontal(); (root.querySelector(selector) || root.querySelector(`[data-browser-action="mode-${browser.mode}"]`))?.focus(); }
  function refreshPicker() {
    root.querySelector('#parameter-options').innerHTML = parameterOptions();
    root.querySelector('#parameter-count').textContent = `${draft.length} ausgewählt`;
  }
  function moveColumns(left) {
    const table = root.querySelector('.patient-table-scroll');
    if (table) { table.scrollLeft = left; browser.horizontal = table.scrollLeft; }
  }
  root.addEventListener('scroll', event => {
    if (event.target.matches?.('.patient-table-scroll')) browser.horizontal = event.target.scrollLeft;
  }, true);
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-browser-action], [data-browser-patient]');
    if (!target) return;
    const name = target.dataset.browserAction;
    if (name==='patient-picker') {
      patientDraft=browser.patientScope==='all'?patients.map(p=>p.id):[...browser.patientIds];
      root.insertAdjacentHTML('beforeend',`<dialog id="patient-picker" aria-labelledby="patient-picker-title"><h2 id="patient-picker-title">Patienten auswählen</h2><p class="subtext">Diese Auswahl gilt in Tabelle und Überlagerung. Die Auswahl ändert keine Berechnungseinstellungen.</p><div class="actions">${action('Alle markieren','patient-all')}${action('Keine markieren','patient-none')}</div><fieldset class="patient-pick-list"><legend>Beispielpersonen</legend>${patients.map(p=>`<label><input type="checkbox" data-patient-pick="${p.id}" ${patientDraft.includes(p.id)?'checked':''}>${p.id} · Genotyp ${p.group}</label>`).join('')}</fieldset><div class="actions">${action('Abbrechen','patient-cancel')}${action('Auswahl übernehmen','patient-apply')}</div></dialog>`);
      const modal=root.querySelector('#patient-picker');modal.showModal();modal.addEventListener('close',()=>modal.remove(),{once:true});return;
    }
    if(name==='patient-all'||name==='patient-none') {patientDraft=name==='patient-all'?patients.map(p=>p.id):[];root.querySelectorAll('[data-patient-pick]').forEach(input=>input.checked=patientDraft.includes(input.dataset.patientPick));return;}
    if(name==='patient-cancel'){root.querySelector('#patient-picker').close();return;}
    if(name==='patient-apply'){browser.patientIds=[...patientDraft];browser.patientScope='selected';browser.patient=null;root.querySelector('#patient-picker').close();redraw('[data-browser-action="patient-picker"]');return;}
    if (name==='mode-table' ||name==='mode-overlay') { browser.mode=name==='mode-table'?'table':'overlay';browser.patient=null;redraw(`[data-browser-action="${name}"]`);return; }
    if (name === 'evaluations') {
      evaluationKey=target.dataset.parameter;
      evaluationDraft=structuredClone(getEvaluation(evaluationKey));
      const parameter=parameters.find(p=>p.key===evaluationKey);
      root.insertAdjacentHTML('beforeend',evaluationPicker(parameter));
      const modal=root.querySelector('#evaluation-dialog'); modal.showModal();
      modal.addEventListener('close',event=>event.target.remove(),{once:true});
      return;
    }
    if (name === 'cancel-evaluation') { root.querySelector('#evaluation-dialog').close(); return; }
    if (name === 'apply-evaluation') {
      if (!validEvaluation(evaluationDraft)) return;
      setEvaluation(evaluationKey,evaluationDraft);
      root.querySelector('#evaluation-dialog').close();
      redraw(`[data-browser-action="evaluations"][data-parameter="${evaluationKey}"]`); return;
    }
    if (name === 'parameters') {
      draft = [...browser.selected]; parameterQuery = '';
      root.insertAdjacentHTML('beforeend', picker());
      root.querySelector('#parameter-dialog').showModal();
      root.querySelector('[data-browser-field="parameter-query"]').focus();
      root.querySelector('#parameter-dialog').addEventListener('close', event => event.target.remove(), { once: true });
      return;
    }
    if (name === 'all-parameters' || name === 'no-parameters') {
      draft = name === 'all-parameters' ? parameters.map(p => p.key) : []; refreshPicker(); return;
    }
    if (name === 'cancel-parameters') { root.querySelector('#parameter-dialog').close(); return; }
    if (name === 'apply-parameters') {
      browser.selected = [...draft];
      if (!browser.selected.includes(browser.sort)) browser.sort = 'id';
      browser.horizontal = 0;
      root.querySelector('#parameter-dialog').close();
      redraw('[data-browser-action="parameters"]'); return;
    }
    if (name === 'columns-left' || name === 'columns-right') {
      moveColumns(browser.horizontal + (name === 'columns-left' ? -columnWidth : columnWidth)); return;
    }
    const rows = filtered();
    const index = rows.findIndex(patient => patient.id === browser.patient);
    let focus = '[data-browser-action="back"]';
    if (target.dataset.browserPatient) browser.patient = target.dataset.browserPatient;
    if (name === 'next' || name === 'previous') {
      browser.patient = rows[index + (name === 'next' ? 1 : -1)]?.id ?? browser.patient;
      focus = '[data-browser-field="patient"]';
    }
    if (name === 'back') {

      focus = `[data-browser-patient="${browser.patient}"]`;
      browser.patient = null;
    }
    redraw(focus);
  });
  function updateEvaluationValidity() {
    const valid=validEvaluation(evaluationDraft);
    root.querySelector('[data-browser-action="apply-evaluation"]').disabled=!valid;
    root.querySelector('#evaluation-error').textContent=valid?'':'Bitte einen Grenzwert und einen positiven Horizont eingeben.';
  }
  root.addEventListener('input', event => {
    if (event.target.dataset.browserField === 'parameter-query') { parameterQuery = event.target.value; refreshPicker(); return; }
    if (event.target.dataset.browserField !== 'query') return;
    browser.query = event.target.value; browser.patient = null;
    // Preserve the search input and pointer targets while typing.
    root.querySelector('#patient-browser-results').innerHTML = browserResults(filtered());
    restoreHorizontal();
  });
  root.addEventListener('change', event => {
    if(event.target.dataset.patientPick){const id=event.target.dataset.patientPick;patientDraft=event.target.checked?[...patientDraft,id]:patientDraft.filter(p=>p!==id);return;}
    const feature=event.target.dataset.evaluationFeature;
    if (feature) {
      evaluationDraft.features=event.target.checked?[...evaluationDraft.features,feature]:evaluationDraft.features.filter(key=>key!==feature);
      updateEvaluationValidity(); return;
    }
    if (event.target.dataset.evaluationField) {
      if (event.target.dataset.evaluationField==='presetId') evaluationDraft.presetId=event.target.value;
      return;
    }
    const key = event.target.dataset.browserField;
    const parameter = event.target.dataset.browserParameter;
    if (parameter) {
      draft = event.target.checked ? [...draft, parameter] : draft.filter(value => value !== parameter);
      root.querySelector('#parameter-count').textContent = `${draft.length} ausgewählt`;
    } else if (key === 'column-jump') {
      const index = browser.selected.indexOf(event.target.value);
      if (index >= 0) moveColumns(index * columnWidth);
      event.target.value = '';
    } else if (key && !['query', 'parameter-query'].includes(key)) {
      browser[key] = event.target.value;
      if (key !== 'patient') { browser.patient = null; }
      redraw(`[data-browser-field="${key}"]`);
    }
  });
}
