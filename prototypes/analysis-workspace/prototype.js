import { patientBrowser, bindPatientBrowser, restorePatientBrowser } from './patient-browser.js';
const root = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const state = { page: 'Daten', loaded: false, started: false, response: 'eGFR', age: 'both', sex: 'both', patient: false, threshold: 30, horizon: 10, direction: 'down', result: '', editOpen: true, lastResult: null };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const button = (label, action, primary = false) => `<button type="button" data-action="${action}" class="${primary ? 'primary' : ''}">${label}</button>`;
const fingerprint = () => JSON.stringify([state.response, state.age, state.sex]);
const fresh = () => state.result === fingerprint();
function saveProjectionSnapshot() {
  if (fresh() && state.lastResult) Object.assign(state.lastResult, {threshold:state.threshold, horizon:state.horizon, direction:state.direction});
}
const validTargets = () => Number.isFinite(state.threshold) && Number.isFinite(state.horizon) && state.horizon > 0;
const count = () => state.age === 'off' ? 48 : 46;
function select(label, key, options) {
  return `<label class="field">${label}<select aria-label="${escape(label)}" data-field="${key}">${options.map(([value, text]) => `<option value="${value}" ${state[key] === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
}
const responseSelect = () => select('Zielgröße', 'response', [['eGFR','eGFR · ml/min/1,73 m²'],['Studienmarker','Studienmarker · U/L']]);
function chart(config = state) {
  if (!Number.isFinite(config.threshold) || !Number.isFinite(config.horizon) || config.horizon <= 0) return '<p class="notice amber">Bitte Grenzwert und positiven Horizont eingeben, um die Projektion darzustellen.</p>';
  const rising = config.response !== 'eGFR';
  const end = Math.max(5, config.horizon);
  const profiles = [0,1].map(i => ({name: i ? 'B' : 'A', start: rising ? 80+i*6 : 60+i*6, slope: rising ? 5+i : -3-i, color: i ? '#487ca9' : '#176c68'}));
  const values = [config.threshold, ...profiles.flatMap(p=>[p.start,p.start+p.slope*end])];
  if (!values.every(Number.isFinite)) return '<p class="notice amber">Der Horizont ist für die Beispieldarstellung zu groß.</p>';
  const low = Math.min(0,...values), high = Math.max(...values,1);
  const span = high-low, min = low-span*.08, max = high+span*.12;
  if (![span,min,max,max-min].every(Number.isFinite)) return '<p class="notice amber">Der Wertebereich ist für die Beispieldarstellung zu groß.</p>';
  const x = time => 55 + time/end*570;
  const y = value => 245 - (value-min)/(max-min)*205;
  const format = value => value.toLocaleString('de-DE',{maximumFractionDigits:1});
  const crossings = profiles.map(p => ({...p, time:(config.threshold-p.start)/p.slope})).filter(p => !(config.direction==='down'?p.start<=config.threshold:p.start>=config.threshold) && p.time>0 && p.time<=config.horizon);
  return `<svg class="chart projection-chart" viewBox="0 0 660 320" role="img" aria-label="Illustrative Gruppenverläufe bis Jahr ${format(end)}, Grenzwert ${format(config.threshold)}. ${crossings.map(p=>`Genotyp ${p.name}: Schnittpunkt nach ${format(p.time)} Jahren.`).join(' ')} Durchgezogen bis Jahr 5, danach gestrichelte Trendfortschreibung.">
    ${[0,1,2,3,4].map(i=>{const value=low+i*span/4;return `<line x1="55" x2="625" y1="${y(value)}" y2="${y(value)}" stroke="#e5eaed"/><text x="46" y="${y(value)+4}" text-anchor="end">${format(value)}</text>`;}).join('')}
    ${[0,1,2,3,4].map(i=>`<text x="${x(end*i/4)}" y="278" text-anchor="middle">${format(end*i/4)}</text>`).join('')}
    <text x="330" y="310" text-anchor="middle">Jahre seit erster Messung</text>
    <line x1="${x(5)}" x2="${x(5)}" y1="35" y2="250" stroke="#a9b7c0" stroke-dasharray="3 5"/><text x="${x(5)-5}" y="25" text-anchor="end">Beispieldaten bis Jahr 5</text>
    <line data-threshold-line x1="55" x2="625" y1="${y(config.threshold)}" y2="${y(config.threshold)}" stroke="#ad792b" stroke-width="1.5" stroke-dasharray="6 4"/>
    <text x="60" y="${y(config.threshold)-9}" style="fill:#92651f">Grenzwert ${format(config.threshold)}</text>
    ${profiles.map(p=>`<path d="M${x(0)} ${y(p.start)} L${x(5)} ${y(p.start+p.slope*5)}" fill="none" stroke="${p.color}" stroke-width="3"/>${end>5?`<path d="M${x(5)} ${y(p.start+p.slope*5)} L${x(end)} ${y(p.start+p.slope*end)}" fill="none" stroke="${p.color}" stroke-width="3" stroke-dasharray="7 5"/>`:''}`).join('')}
    ${crossings.map((p,i)=>`<circle data-crossing="${p.name}" cx="${x(p.time)}" cy="${y(config.threshold)}" r="6" fill="white" stroke="${p.color}" stroke-width="3"/><text x="${x(p.time)-8}" y="${y(config.threshold)+20+i*17}" text-anchor="end">${p.name}: ${format(p.time)} J.</text>`).join('')}
  </svg><div class="legend"><span><i class="dot a"></i>Genotyp A</span><span><i class="dot b"></i>Genotyp B</span><span>Gestrichelt: Fortschreibung nach Jahr 5</span></div><p class="chart-note">Feste illustrative Trends; keine Modellschätzung. Markiert werden erreichbare Schnittpunkte innerhalb des gewählten Horizonts. Die Statusangaben stehen rechts bzw. darunter.</p>`;
}
function dataPage() {
  if (!state.loaded) return `<div class="page-heading"><div><p class="eyebrow">01 / Datenbasis</p><h1>Mit einer klaren Datenbasis starten</h1><p class="muted">Messungen, Personenmerkmale und Ereignisse an einem Ort prüfen.</p></div></div><div class="card hero"><p class="eyebrow">Arbeitsplatz vorbereiten</p><h2>Welche Verläufe möchtest du untersuchen?</h2><p>Öffne den Beispieldatensatz und gehe den Weg von der Datenprüfung bis zum Ergebnis durch.</p><div class="actions">${button('Beispieldaten öffnen','load',true)}${button('Daten importieren','import')}</div></div><div class="equal" style="margin-top:22px"><div class="card"><h2>Erst verstehen</h2><p class="muted">Variablen zuordnen, fehlende Angaben erkennen und einzelne Verläufe ansehen.</p></div><div class="card"><h2>Dann untersuchen</h2><p class="muted">Gruppen vergleichen, Einflussfaktoren auswählen und Trends zu Grenzwerten fortschreiben.</p></div></div>`;
  return `<div class="page-heading"><div><p class="eyebrow">01 / Datenbasis</p><h1>Beispielkohorte</h1><p class="muted">Synthetische Daten · 12 Parameter · 6 Zeitpunkte pro Person · 5 Jahre Beobachtung</p></div>${button('Verläufe ansehen','trajectories',true)}</div><div class="columns"><div class="stack"><div class="card"><div class="stats"><div class="stat"><span>Personen</span><strong>48</strong></div><div class="stat"><span>Messungen je Parameter</span><strong>288</strong></div><div class="stat"><span>Gruppen</span><strong>2</strong></div></div><h2>Variablen und ihre Rolle</h2><div class="table-scroll"><table><thead><tr><th>Variable</th><th>Rolle</th><th>Beispiel</th></tr></thead><tbody>${[['Person','Identifikation','001'],['Zeit seit erster Messung','Zeitachse','0–5 Jahre'],['eGFR, Kreatinin, Hämoglobin, CRP','Messgrößen','Verschiedene Einheiten'],['Genotyp','Vergleichsfaktor','A / B'],['Alter bei erster Messung','Einflussfaktor','42 Jahre'],['Geschlecht','Einflussfaktor','weiblich / männlich']].map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></div><div class="stack"><div class="card"><span class="badge amber">Prüfen</span><h2 style="margin-top:14px">2 Altersangaben fehlen</h2><p class="muted">Personen 047 und 048 bleiben in den Verläufen sichtbar. Analysen mit Alter berücksichtigen 46 Personen und 276 Messungen.</p><details><summary>Betroffene Personen</summary><p class="subtext">047 · Genotyp A<br>048 · Genotyp B</p></details></div><div class="card"><h2>Bereit für eine Fragestellung</h2><p class="muted">Vergleiche Genotypen unter Berücksichtigung weiterer Merkmale.</p>${button('Analyse beginnen','start')}</div></div></div>`;
}
function trajectoriesPage() { return patientBrowser(); }
function formula(config = state) {
  const factors = [['Alter₀',config.age],['Geschlecht',config.sex]];
  return `${config.response} ~ Zeit × Genotyp${factors.filter(([,v])=>v!=='off').map(([name,v])=>` + ${v==='both' ? `Zeit × ${name}` : name}`).join('')} + (1 + Zeit | Person)`;
}
function projections(readOnly = false, config = state) {
  const valid = Number.isFinite(config.threshold) && Number.isFinite(config.horizon) && config.horizon > 0;
  return `<h2>Wann erreicht der Trend den Grenzwert?</h2><p class="muted">Fortschreibung ab erster Messung (Jahr 0), für das Referenzprofil. Keine Ereigniszeitanalyse.</p>${readOnly ? `<p>Grenzwert: ${config.threshold} ${config.response === 'eGFR' ? 'ml/min/1,73 m²' : 'U/L'} · Horizont: ${config.horizon} Jahre</p>` : `<div class="inline-fields"><label class="field">Grenzwert (${config.response === 'eGFR' ? 'ml/min/1,73 m²' : 'U/L'})<input data-field="threshold" type="number" value="${config.threshold}"></label><label class="field">Horizont in Jahren<input data-field="horizon" type="number" min="0.1" step="0.1" value="${config.horizon}"></label></div>${select('Richtung','direction',[['down','Abwärts (≤)'],['up','Aufwärts (≥)']])}`}<p class="subtext">Richtung: ${config.direction === 'down' ? 'abwärts' : 'aufwärts'} · frei wählbarer numerischer Grenzwert</p><div class="projection-result">${!valid ? '<p class="notice amber">Bitte einen gültigen Grenzwert und einen positiven Horizont eingeben.</p>' : `<table><thead><tr><th>Profil</th><th>Illustrative Trendfortschreibung</th></tr></thead><tbody>${['A','B'].map((g,i)=>{const start = config.response==='eGFR'?60+i*6:80+i*6;const slope=config.response==='eGFR'?-3-i:5+i;const years=(config.threshold-start)/slope;return `<tr><td>Genotyp ${g}</td><td>${(config.direction==='down'?start<=config.threshold:start>=config.threshold)?'Bereits am Ausgangspunkt erreicht':years<0?'Trend verläuft in Gegenrichtung':years>config.horizon?'Nicht innerhalb des Horizonts':`${years.toFixed(1)} Jahre`}</td></tr>`;}).join('')}</tbody></table>`}<p class="notice">Illustrative feste Trends, ohne Unsicherheitsintervall. Eine spätere Ereigniszeitanalyse ist als eigene Erweiterung vorgesehen.</p></div>`;
}
function analysisConfig() {
  const effects = [['both','Niveau + jährliche Änderung'],['level','Nur Niveau'],['off','Nicht einbeziehen']];
  return `<section class="card analysis-config" aria-labelledby="config-title"><div class="card-header"><div><h2 id="config-title">Analyseeinstellungen</h2>${state.editOpen?'':`<p class="subtext">${escape(state.response)} · Gruppenmodell · Genotyp A / B · ${count()} Personen${!fresh()&&state.lastResult?' · geänderte Einstellungen':''}</p>`}</div><button type="button" data-action="toggle-config" aria-expanded="${state.editOpen}" aria-controls="analysis-config-content">${state.editOpen?'Einstellungen einklappen':'Einstellungen bearbeiten'}</button></div>
    <div id="analysis-config-content" ${state.editOpen?'':'hidden'}>
    <div class="analysis-basics">${responseSelect()}<div class="field">Modell<strong>Gruppenvergleich im Zeitverlauf</strong><span>Genotyp · Referenz A</span></div><div class="field">Datenbasis<strong>Beispielkohorte · 48 Personen</strong><span>Jahre seit erster Messung</span></div></div>
    <h3>Einflussfaktoren</h3><p class="subtext">Lege für jedes Merkmal fest, ob es das Niveau und die jährliche Änderung berücksichtigt.</p>
    <table class="factor-table"><thead><tr><th scope="col">Merkmal</th><th scope="col">Einbeziehen für</th></tr></thead><tbody>${[['Alter bei erster Messung','age'],['Geschlecht','sex']].map(([label,key])=>`<tr><th scope="row">${label}</th><td>${select(label,key,effects)}</td></tr>`).join('')}</tbody></table>
    <details><summary>Modellformel lesen</summary><p class="formula">${escape(formula())}</p><p class="subtext">× enthält Haupteffekte und Wechselwirkung. Zeit × Alter₀ lässt die Steigung vom Ausgangsalter abhängen.</p></details>
    <div class="analysis-run"><p class="notice ${state.age==='off'?'':'amber'}">${count()} von 48 Personen · ${count()*6} Messungen.${state.age==='off'?'':' Bei 2 Personen fehlt das Ausgangsalter.'}</p><div><div class="actions">${button(state.lastResult ? 'Beispiel neu berechnen' : 'Beispiel berechnen','run',true)}${state.lastResult ? button('Änderungen verwerfen', 'discard-config') : ''}</div><p class="subtext">Illustrative Werte, keine echte Modellberechnung.</p></div></div></div></section>`;
}
function analysisResults() {
  if (!state.lastResult) return '<p class="muted analysis-placeholder">Das Ergebnis erscheint nach dem Berechnen unter den Analyseeinstellungen.</p>';
  const config = fresh() ? state : state.lastResult;
  const n = config.age === 'off' ? 48 : 46;
  const effect = value => value === 'both' ? 'Niveau + Änderung' : value === 'level' ? 'nur Niveau' : 'nicht einbezogen';
  return `<section class="card analysis-results" aria-labelledby="results-title"><div class="card-header"><div><p class="eyebrow">${fresh()?'Ergebnis':'Bisheriges Ergebnis'}</p><h2 id="results-title" tabindex="-1">${escape(config.response)}: Gruppenvergleich</h2><p class="muted">${n} Personen · ${n*6} Messungen · Alter: ${effect(config.age)} · Geschlecht: ${effect(config.sex)}</p></div><span class="badge ${fresh()?'green':'amber'}">${fresh()?'Beispielergebnis':'Veraltet'}</span></div>
    ${fresh()?'':'<p class="notice amber" role="status">Die Einstellungen wurden geändert. Dieses Ergebnis zeigt weiterhin die vorherige Konfiguration. Bitte neu berechnen; Export ist bis dahin gesperrt.</p>'}
    <div class="analysis-linked-results"><div class="analysis-plot-panel"><h3>Verlauf und Trendfortschreibung</h3><p class="muted">Illustratives Referenzprofil: Alter₀ 50 Jahre · weiblich · Genotyp A / B</p><div id="linked-projection-chart">${chart(config)}</div></div><section class="analysis-projection-panel" aria-label="Grenzwertprojektion">${projections(!fresh(),config)}</section></div>
    <details class="analysis-provenance"><summary>Modell und Datengrundlage</summary><p class="formula">${escape(formula(config))}</p><p class="muted">Zeit: Jahre seit erster Messung. Referenzprofil: Genotyp A/B, Alter₀ 50 Jahre, weiblich. Zufälliger Achsenabschnitt und zufällige Steigung pro Person.</p><p>${48-n} Personen wegen fehlenden Alters ausgeschlossen.</p><p class="notice">Alle Ergebniswerte sind fest vorgegeben. Ein statistisches Modell wird im Prototyp nicht geschätzt.</p></details>
    <div class="analysis-result-actions"><button type="button" data-action="export" ${fresh()&&validTargets()?'':'disabled'}>Bericht exportieren</button></div></section>`;

}
function analysisPage() {
  if (!state.started) return `<h1>Eine Fragestellung wählen</h1><p class="muted">Einstellungen und Ergebnisse liegen in einem gemeinsamen Arbeitsbereich.</p><div class="equal"><div class="card"><h2>Unterscheiden sich Gruppen?</h2><p class="muted">Niveau und Änderung über die Zeit vergleichen, weitere Merkmale berücksichtigen.</p>${button('Genotypvergleich vorbereiten','start',true)}</div><div class="card"><h2>Wann wird ein Grenzwert erreicht?</h2><p class="muted">Einen geschätzten Trend für definierte Profile fortschreiben.</p>${button('Trendfortschreibung vorbereiten','projection-start')}</div></div>`;
  return `<div class="page-heading"><div><p class="eyebrow">03 / Analysen</p><h1>Genotypen im Verlauf vergleichen</h1><p class="muted">Analyse einstellen, berechnen und das Ergebnis darunter prüfen.</p></div></div>
    ${analysisConfig()}${analysisResults()}`;
}
function render() {
  root.innerHTML = `<header class="topbar"><div class="brand"><svg width="27" height="27" viewBox="0 0 28 28" aria-hidden="true"><path d="M3 4v21h23M5 10l6 3 6-5 8 9" fill="none" stroke="currentColor" stroke-width="2"/></svg>Trajektorien</div><nav class="nav" aria-label="Hauptnavigation">${['Daten','Verläufe','Analysen'].map(page=>`<button data-page="${page}" ${state.page===page?'aria-current="page"':''} ${!state.loaded&&page!=='Daten'?'disabled':''}>${page}</button>`).join('')}</nav><div class="top-actions"><span class="badge">Entwurf · Beispieldaten</span></div></header><main id="content" class="workspace">${state.page==='Daten'?dataPage():state.page==='Verläufe'?trajectoriesPage():analysisPage()}</main><footer class="prototype-footer">Klick-Prototyp · Alle Daten und Ergebnisse sind illustrativ · Nur für Forschungszwecke</footer>`;
  restorePatientBrowser(root);
}
function showDialog(title, body) {
  dialog.innerHTML = `<button class="dialog-close quiet" data-action="close" aria-label="Dialog schließen">✕</button><h2 id="dialog-title">${title}</h2>${body}`;
  dialog.showModal();
}
function report() {
  return `<h1>Illustrativer Analysebericht</h1><p>Klick-Prototyp · Beispieldaten · Keine Modellberechnung · Nur für Forschungszwecke</p><h2>Konfiguration</h2><p>${escape(formula())}</p><p>${count()} Personen, ${count()*6} Messungen; ${48-count()} Personen wegen fehlenden Alters ausgeschlossen.</p><p>Referenzprofil: Genotyp A/B, Ausgangsalter 50 Jahre, weiblich.</p>${projections(true)}`;
}
document.addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target || target.dataset.browserAction || target.dataset.browserPatient) return;
  if (target.dataset.page) state.page=target.dataset.page;
  const action=target.dataset.action;
  if (action==='load') state.loaded=true;
  if (action==='trajectories') state.page='Verläufe';
  if (action==='patient') state.patient=!state.patient;
  if (action==='start'||action==='projection-start') { state.started=true; state.page='Analysen'; }
  if (action==='toggle-config') state.editOpen=!state.editOpen;
  if (action==='discard-config' && state.lastResult) { Object.assign(state, state.lastResult); state.editOpen=false; }
  if (action==='run') { state.result=fingerprint(); state.lastResult = {response:state.response, age:state.age, sex:state.sex, threshold:state.threshold, horizon:state.horizon, direction:state.direction}; state.editOpen=false; document.querySelector('#announcement').textContent='Illustratives Beispielergebnis aktualisiert.'; }
  if (action==='import') { showDialog('Import im späteren Arbeitsablauf','<p>Hier werden Dateien ausgewählt, Spalten zugeordnet und die Datenqualität geprüft. Der Klick-Prototyp öffnet ausschließlich feste Beispieldaten.</p>'+button('Beispieldaten öffnen','dialog-load',true)); return; }
  if (action==='dialog-load') { state.loaded=true; dialog.close(); }
  if (action==='close') { dialog.close(); return; }
  if (action==='export'&&fresh()&&validTargets()) { showDialog('Bericht prüfen',`<div class="report">${report()}</div>${button('HTML-Bericht herunterladen','download',true)}`); return; }
  if (action==='download'&&fresh()&&validTargets()) {
    const url=URL.createObjectURL(new Blob([`<!doctype html><html lang="de"><meta charset="utf-8"><title>Illustrativer Analysebericht</title><body>${report()}</body></html>`],{type:'text/html;charset=utf-8'}));
    const link=document.createElement('a'); link.href=url; link.download='prototyp-analysebericht.html'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); return;
  }
  render();
  const selector = target.dataset.page ? `[data-page="${target.dataset.page}"]` : `[data-action="${action}"]`;
  const focusTarget = action==='run' ? root.querySelector('#results-title') : action==='discard-config' ? root.querySelector('[data-action="toggle-config"]') : root.querySelector(selector) || root.querySelector('h1');
  if (focusTarget) { if (focusTarget.tagName === 'H1') focusTarget.tabIndex = -1; focusTarget.focus(); }
});
root.addEventListener('input', event => {
  const key=event.target.dataset.field;
  if (!['threshold','horizon'].includes(key)) return;
  state[key]=event.target.value===''?NaN:Number(event.target.value);
  saveProjectionSnapshot();
  const fragment=document.createElement('template'); fragment.innerHTML=projections();
  root.querySelector('.projection-result')?.replaceWith(fragment.content.querySelector('.projection-result'));
  const linkedChart = root.querySelector('#linked-projection-chart');
  if (linkedChart) linkedChart.innerHTML = chart();
  const exportButton=root.querySelector('[data-action="export"]');
  if (exportButton) exportButton.disabled=!fresh()||!validTargets();
});
root.addEventListener('change', event => {
  const key=event.target.dataset.field; if (!key || ['threshold','horizon'].includes(key)) return;
  state[key]=['threshold','horizon'].includes(key)?(event.target.value===''?NaN:Number(event.target.value)):event.target.value;
  if(key==='direction') saveProjectionSnapshot();
  if(key==='response') { state.threshold=state.response==='eGFR'?30:110; state.direction=state.response==='eGFR'?'down':'up'; }
  render();
  root.querySelector(`[data-field="${key}"]`)?.focus();
});
render();

bindPatientBrowser(root, render);
