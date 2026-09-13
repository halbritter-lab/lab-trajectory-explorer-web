// Self-contained illustrative data. No clinical computation or production imports.
const parameters = [
  { key: 'egfr', name: 'eGFR', unit: 'ml/min/1,73 m²', min: 0, max: 120, color: '#176c68' },
  { key: 'creatinine', name: 'Kreatinin', unit: 'mg/dl', min: 0, max: 4, color: '#487ca9' },
  { key: 'hemoglobin', name: 'Hämoglobin', unit: 'g/dl', min: 8, max: 18, color: '#9d5d72' },
  { key: 'crp', name: 'CRP', unit: 'mg/l', min: 0, max: 60, color: '#ac792b' },
];
const patients = Array.from({ length: 48 }, (_, index) => ({
  id: String(index + 1).padStart(3, '0'),
  group: index % 2 ? 'B' : 'A',
  values: Object.fromEntries(parameters.map((parameter, p) => [parameter.key,
    Array.from({ length: 6 }, (_, t) => {
      const wave = Math.sin(index * 1.7 + t * 1.3);
      const value = p === 0 ? 90 - index % 13 * 3 - t * (index % 5 + 1) + wave * 3
        : p === 1 ? 0.8 + index % 9 * 0.12 + t * (index % 5) * 0.07 + wave * 0.06
          : p === 2 ? 15 - index % 6 * 0.5 - t * ((index % 3) - 1) * 0.22 + wave * 0.3
            : 5 + index % 7 + (t === index % 6 ? 15 + index % 25 : 0) + wave * 2;
      return { time: t, value };
    })])),
}));
const browser = { selected: ['egfr', 'hemoglobin', 'crp'], query: '', group: 'all', sort: 'id', page: 0, patient: null };
const pageSize = 8;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = value => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const action = (label, name, disabled = false) => `<button type="button" data-browser-action="${name}" ${disabled ? 'disabled' : ''}>${label}</button>`;
function filtered() {
  const rows = patients.filter(patient => patient.id.includes(browser.query.trim()) && (browser.group === 'all' || patient.group === browser.group));
  if (browser.sort !== 'id') rows.sort((a, b) => b.values[browser.sort].at(-1).value - a.values[browser.sort].at(-1).value);
  return rows;
}
function plot(patient, parameter, large = false) {
  const width = large ? 550 : 245, height = large ? 215 : 94;
  const left = large ? 38 : 30, right = width - 12, top = 12, bottom = height - 24;
  const x = time => left + time / 5 * (right - left);
  const y = value => bottom - (value - parameter.min) / (parameter.max - parameter.min) * (bottom - top);
  const points = patient.values[parameter.key];
  return `<svg class="patient-plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="Person ${patient.id}, ${parameter.name}, ${parameter.unit}, sechs illustrative Messungen über fünf Jahre: ${points.map(point => `Jahr ${point.time}: ${number(point.value)} ${parameter.unit}`).join('; ')}">
    ${[parameter.min, (parameter.min + parameter.max) / 2, parameter.max].map(v => `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="#e5eaed"/><text x="${left - 5}" y="${y(v) + 3}" text-anchor="end">${number(v)}</text>`).join('')}
    <polyline points="${points.map(point => `${x(point.time)},${y(point.value)}`).join(' ')}" fill="none" stroke="${parameter.color}" stroke-width="2"/>
    ${points.map(point => `<circle cx="${x(point.time)}" cy="${y(point.value)}" r="${large ? 3 : 2}" fill="${parameter.color}"/>`).join('')}
    ${[0, 5].map(t => `<text x="${x(t)}" y="${height - 6}" text-anchor="middle">${t} J.</text>`).join('')}
  </svg>`;
}
function parameterControls() {
  return `<fieldset class="parameter-picker"><legend>Parameter vergleichen</legend>${parameters.map(parameter => `<label><input type="checkbox" data-browser-parameter="${parameter.key}" ${browser.selected.includes(parameter.key) ? 'checked' : ''}>${parameter.name}<span class="subtext">${parameter.unit}</span></label>`).join('')}</fieldset>`;
}
function patientDetail(rows) {
  const index = rows.findIndex(patient => patient.id === browser.patient);
  const patient = rows[index];
  if (!patient) { browser.patient = null; return table(rows); }
  return `<div class="patient-toolbar"><div class="actions">${action('← Zur Tabelle', 'back')}${action('← Vorherige Person', 'previous', index === 0)}${action('Nächste Person →', 'next', index === rows.length - 1)}</div><span class="muted">${index + 1} von ${rows.length} in der aktuellen Auswahl</span></div>
    <div class="page-heading"><div><p class="eyebrow">Patientenansicht</p><h2>Person ${patient.id}</h2><p class="muted">Genotyp ${patient.group} · 6 Zeitpunkte · gleiche Zeitachse für alle Parameter</p></div><label class="field">Direkt zu Person<select data-browser-field="patient" aria-label="Direkt zu Person">${rows.map(row => `<option ${row.id === patient.id ? 'selected' : ''}>${row.id}</option>`).join('')}</select></label></div>
    ${browser.selected.length ? `<div class="patient-detail-grid">${browser.selected.map(key => { const parameter = parameters.find(p => p.key === key); return `<section class="card"><h3>${parameter.name} <span class="muted">${parameter.unit}</span></h3>${plot(patient, parameter, true)}<p class="subtext">Erster Wert ${number(patient.values[key][0].value)} · letzter Wert ${number(patient.values[key].at(-1).value)} ${parameter.unit}</p></section>`; }).join('')}</div>` : '<p class="notice">Wähle oben mindestens einen Parameter für die Verlaufsansicht.</p>'}`;
}
function table(rows) {
  const maxPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  browser.page = Math.min(browser.page, maxPage);
  const visible = rows.slice(browser.page * pageSize, (browser.page + 1) * pageSize);
  return `<div class="patient-toolbar"><div><h2>Patientenübersicht</h2><span class="muted">${rows.length} von 48 Personen · Personen-ID öffnen zum Durchblättern</span></div><div class="actions">${action('← Vorherige Seite', 'page-previous', browser.page === 0)}<span class="subtext">${browser.page + 1} / ${maxPage + 1}</span>${action('Nächste Seite →', 'page-next', browser.page === maxPage)}</div></div>
    ${!rows.length ? '<div class="empty"><h2>Keine passenden Personen</h2><p class="muted">Suche oder Gruppenfilter ändern.</p></div>' : !browser.selected.length ? '<p class="notice">Wähle oben mindestens einen Parameter für die Vergleichstabelle.</p>' : `<div class="patient-table-scroll" tabindex="0" role="region" aria-label="Patiententabelle mit vergleichbaren Verlaufsgrafiken"><table class="patient-table"><thead><tr><th scope="col">Person</th>${browser.selected.map(key => { const parameter = parameters.find(p => p.key === key); return `<th scope="col">${parameter.name}<span class="subtext">${parameter.unit}</span></th>`; }).join('')}</tr></thead><tbody>${visible.map(patient => `<tr><th scope="row"><button class="table-link" data-browser-patient="${patient.id}" aria-label="Person ${patient.id} öffnen">${patient.id} ↗</button><span class="subtext">Genotyp ${patient.group}</span></th>${browser.selected.map(key => { const parameter = parameters.find(p => p.key === key); return `<td>${plot(patient, parameter)}<span class="cell-summary">${number(patient.values[key][0].value)} → ${number(patient.values[key].at(-1).value)} ${parameter.unit}</span></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`}`;
}
export function patientBrowser() {
  const rows = filtered();
  return `<div class="page-heading"><div><p class="eyebrow">02 / Verläufe</p><h1>Patienten und Parameter erkunden</h1><p class="muted">Verläufe über Personen hinweg vergleichen und mehrere Messgrößen gemeinsam betrachten.</p></div></div>
    <div class="card browser-controls"><div class="browser-filters"><label class="field">Person suchen<input type="search" data-browser-field="query" value="${esc(browser.query)}" placeholder="z. B. 012" autocomplete="off"></label><label class="field">Gruppe<select data-browser-field="group"><option value="all">Alle Gruppen</option>${['A', 'B'].map(group => `<option value="${group}" ${browser.group === group ? 'selected' : ''}>Genotyp ${group}</option>`).join('')}</select></label><label class="field">Sortieren nach<select data-browser-field="sort"><option value="id">Personen-ID</option>${browser.selected.map(key => { const parameter = parameters.find(p => p.key === key); return `<option value="${key}" ${browser.sort === key ? 'selected' : ''}>${parameter.name}: letzter Wert ↓</option>`; }).join('')}</select></label></div>${parameterControls()}</div>
    <p class="browser-scale-note">Gemeinsame Zeitachse: Jahre seit erster Messung · feste Werteskala je Parameter über alle Personen · unterschiedliche Einheiten werden separat dargestellt.</p>
    <div id="patient-browser-results">${browser.patient ? patientDetail(rows) : table(rows)}</div>
    <p class="chart-note">Synthetische Beispielverläufe · verbundene Messpunkte, keine Modellschätzungen. Die Parameterliste steht beispielhaft für die später aus den Daten verfügbaren Messgrößen.</p>`;
}
export function bindPatientBrowser(root, render) {
  function redraw(selector) { render(); root.querySelector(selector)?.focus(); }
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-browser-action], [data-browser-patient]');
    if (!target) return;
    const rows = filtered();
    const index = rows.findIndex(patient => patient.id === browser.patient);
    const name = target.dataset.browserAction;
    let focus = '[data-browser-action="back"]';
    if (target.dataset.browserPatient) browser.patient = target.dataset.browserPatient;
    if (name === 'next' || name === 'previous') {
      browser.patient = rows[index + (name === 'next' ? 1 : -1)]?.id ?? browser.patient;
      focus = '[data-browser-field="patient"]';
    }
    if (name === 'back') {
      browser.page = Math.floor(index / pageSize);
      focus = `[data-browser-patient="${browser.patient}"]`;
      browser.patient = null;
    }
    if (name === 'page-next' || name === 'page-previous') {
      browser.page += name === 'page-next' ? 1 : -1;
      focus = '.patient-table-scroll';
    }
    redraw(focus);
  });
  root.addEventListener('input', event => {
    if (event.target.dataset.browserField !== 'query') return;
    browser.query = event.target.value; browser.page = 0; browser.patient = null;
    // Preserve the search input and pointer targets while typing.
    root.querySelector('#patient-browser-results').innerHTML = table(filtered());
  });
  root.addEventListener('change', event => {
    const key = event.target.dataset.browserField;
    const parameter = event.target.dataset.browserParameter;
    if (parameter) {
      browser.selected = event.target.checked ? [...browser.selected, parameter] : browser.selected.filter(value => value !== parameter);
      if (!browser.selected.includes(browser.sort)) browser.sort = 'id';
      redraw(`[data-browser-parameter="${parameter}"]`);
    } else if (key && key !== 'query') {
      browser[key] = event.target.value;
      if (key !== 'patient') { browser.page = 0; browser.patient = null; }
      redraw(`[data-browser-field="${key}"]`);
    }
  });
}
