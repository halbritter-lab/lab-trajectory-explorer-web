const root = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const state = { page: 'Daten', loaded: false, started: false, tab: 'Überblick', response: 'eGFR', age: 'both', sex: 'both', patient: false, threshold: 30, horizon: 10, direction: 'down', result: '' };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const button = (label, action, primary = false) => `<button type="button" data-action="${action}" class="${primary ? 'primary' : ''}">${label}</button>`;
const fingerprint = () => JSON.stringify([state.response, state.age, state.sex]);
const fresh = () => state.result === fingerprint();
const validTargets = () => Number.isFinite(state.threshold) && Number.isFinite(state.horizon) && state.horizon > 0;
const count = () => state.age === 'off' ? 48 : 46;
function select(label, key, options) {
  return `<label class="field">${label}<select aria-label="${escape(label)}" data-field="${key}">${options.map(([value, text]) => `<option value="${value}" ${state[key] === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
}
const responseSelect = () => select('Zielgröße', 'response', [['eGFR','eGFR · ml/min/1,73 m²'],['Studienmarker','Studienmarker · U/L']]);
function chart() {
  const rising = state.response !== 'eGFR';
  const individual = state.page === 'Verläufe' && state.patient;
  const y = value => 243 - value / (rising ? 140 : 100) * 208;
  const start = rising ? 80 : 60;
  const slope = rising ? 5 : -3;
  return `<svg class="chart" viewBox="0 0 660 310" role="img" aria-label="Illustrative ${individual ? 'Einzeltrajektorie' : 'Gruppenverläufe'}: ${rising ? 'steigende' : 'fallende'} Werte über fünf Jahre">
    ${[0,1,2,3,4].map(i => `<line x1="55" y1="${35+i*52}" x2="635" y2="${35+i*52}" stroke="#e5eaed"/><text x="40" y="${40+i*52}" text-anchor="end">${(rising ? 140 : 100)-i*(rising ? 35 : 25)}</text>`).join('')}
    ${[0,1,2,3,4,5].map(i => `<text x="${55+i*116}" y="274" text-anchor="middle">${i}</text>`).join('')}
    <text x="330" y="305" text-anchor="middle">Jahre seit erster Messung</text>
    <path d="${`M55 ${y(start)} L635 ${y(start+slope*5)}`}" fill="none" stroke="#176c68" stroke-width="4"/>
    ${individual ? '' : `<path d="${`M55 ${y(start+6)} L635 ${y(start+6+(rising?6:-4)*5)}`}" fill="none" stroke="#487ca9" stroke-width="4"/>`}
    ${[0,1,2,3,4,5].map(i => `<circle cx="${55+i*116}" cy="${y(start+slope*i)}" r="5" fill="#176c68"/>`).join('')}
  </svg><div class="legend"><span><i class="dot a"></i>${individual ? 'Person 001' : 'Genotyp A'}</span>${individual ? '' : '<span><i class="dot b"></i>Genotyp B</span>'}</div><p class="chart-note">Illustration mit festen Beispielwerten; keine Modellschätzung.</p>`;
}
function dataPage() {
  if (!state.loaded) return `<div class="page-heading"><div><p class="eyebrow">01 / Datenbasis</p><h1>Mit einer klaren Datenbasis starten</h1><p class="muted">Messungen, Personenmerkmale und Ereignisse an einem Ort prüfen.</p></div></div><div class="card hero"><p class="eyebrow">Arbeitsplatz vorbereiten</p><h2>Welche Verläufe möchtest du untersuchen?</h2><p>Öffne den Beispieldatensatz und gehe den Weg von der Datenprüfung bis zum Ergebnis durch.</p><div class="actions">${button('Beispieldaten öffnen','load',true)}${button('Daten importieren','import')}</div></div><div class="equal" style="margin-top:22px"><div class="card"><h2>Erst verstehen</h2><p class="muted">Variablen zuordnen, fehlende Angaben erkennen und einzelne Verläufe ansehen.</p></div><div class="card"><h2>Dann untersuchen</h2><p class="muted">Gruppen vergleichen, Einflussfaktoren auswählen und Trends zu Grenzwerten fortschreiben.</p></div></div>`;
  return `<div class="page-heading"><div><p class="eyebrow">01 / Datenbasis</p><h1>Beispielkohorte</h1><p class="muted">Synthetische Daten · 6 Messungen pro Person · 5 Jahre Beobachtung</p></div>${button('Verläufe ansehen','trajectories',true)}</div><div class="columns"><div class="stack"><div class="card"><div class="stats"><div class="stat"><span>Personen</span><strong>48</strong></div><div class="stat"><span>Messungen</span><strong>288</strong></div><div class="stat"><span>Gruppen</span><strong>2</strong></div></div><h2>Variablen und ihre Rolle</h2><div class="table-scroll"><table><thead><tr><th>Variable</th><th>Rolle</th><th>Beispiel</th></tr></thead><tbody>${[['Person','Identifikation','001'],['Zeit seit erster Messung','Zeitachse','0–5 Jahre'],['eGFR / Studienmarker','Zielgröße','60 / 80'],['Genotyp','Vergleichsfaktor','A / B'],['Alter bei erster Messung','Einflussfaktor','42 Jahre'],['Geschlecht','Einflussfaktor','weiblich / männlich']].map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></div><div class="stack"><div class="card"><span class="badge amber">Prüfen</span><h2 style="margin-top:14px">2 Altersangaben fehlen</h2><p class="muted">Personen 047 und 048 bleiben in den Verläufen sichtbar. Analysen mit Alter berücksichtigen 46 Personen und 276 Messungen.</p><details><summary>Betroffene Personen</summary><p class="subtext">047 · Genotyp A<br>048 · Genotyp B</p></details></div><div class="card"><h2>Bereit für eine Fragestellung</h2><p class="muted">Vergleiche Genotypen unter Berücksichtigung weiterer Merkmale.</p>${button('Analyse beginnen','start')}</div></div></div>`;
}
function trajectoriesPage() {
  return `<div class="page-heading"><div><p class="eyebrow">02 / Verläufe</p><h1>${state.patient ? 'Person 001' : 'Verläufe verstehen'}</h1><p class="muted">Beispielkohorte · ${state.patient ? '6 Messungen' : '48 Personen · 288 Messungen'}</p></div>${button('Als Analyse übernehmen','start',true)}</div><div class="context">${responseSelect()}<div class="right">${button(state.patient ? 'Zur Kohorte' : 'Person 001 ansehen','patient')}</div></div><div class="card"><div class="card-header"><div><h2>${escape(state.response)} im Zeitverlauf</h2><p class="muted">${state.patient ? 'Individueller Verlauf' : 'Gruppenübersicht'} · Beispieldarstellung</p></div><span class="badge">Genotyp A / B</span></div>${chart()}</div>`;
}
function formula() {
  const factors = [['Alter₀',state.age],['Geschlecht',state.sex]];
  return `${state.response} ~ Zeit × Genotyp${factors.filter(([,v])=>v!=='off').map(([name,v])=>` + ${v==='both' ? `Zeit × ${name}` : name}`).join('')} + (1 + Zeit | Person)`;
}
function projections(readOnly = false) {
  const valid = validTargets();
  return `<h2>Wann erreicht der Trend den Grenzwert?</h2><p class="muted">Fortschreibung ab erster Messung (Jahr 0), für das Referenzprofil. Keine Ereigniszeitanalyse.</p>${readOnly ? `<p>Grenzwert: ${state.threshold} ${state.response === 'eGFR' ? 'ml/min/1,73 m²' : 'U/L'} · Horizont: ${state.horizon} Jahre</p>` : `<div class="inline-fields"><label class="field">Grenzwert (${state.response === 'eGFR' ? 'ml/min/1,73 m²' : 'U/L'})<input data-field="threshold" type="number" value="${state.threshold}"></label><label class="field">Horizont in Jahren<input data-field="horizon" type="number" min="0.1" step="0.1" value="${state.horizon}"></label></div>${select('Richtung','direction',[['down','Abwärts (≤)'],['up','Aufwärts (≥)']])}`}<p class="subtext">Richtung: ${state.direction === 'down' ? 'abwärts' : 'aufwärts'} · frei wählbarer numerischer Grenzwert</p><div class="projection-result">${!valid ? '<p class="notice amber">Bitte einen gültigen Grenzwert und einen positiven Horizont eingeben.</p>' : `<table><thead><tr><th>Profil</th><th>Illustrative Trendfortschreibung</th></tr></thead><tbody>${['A','B'].map((g,i)=>{const start = state.response==='eGFR'?60+i*6:80+i*6;const slope=state.response==='eGFR'?-3-i:5+i;const years=(state.threshold-start)/slope;return `<tr><td>Genotyp ${g}</td><td>${(state.direction==='down'?start<=state.threshold:start>=state.threshold)?'Bereits am Ausgangspunkt erreicht':years<0?'Trend verläuft in Gegenrichtung':years>state.horizon?'Nicht innerhalb des Horizonts':`${years.toFixed(1)} Jahre`}</td></tr>`;}).join('')}</tbody></table>`}<p class="notice">Illustrative feste Trends, ohne Unsicherheitsintervall. Eine spätere Ereigniszeitanalyse ist als eigene Erweiterung vorgesehen.</p></div>`;
}
function analysisPage() {
  if (!state.started) return `<h1>Eine Fragestellung wählen</h1><p class="muted">Die Konfiguration und das Ergebnis bleiben anschließend gemeinsam sichtbar.</p><div class="equal"><div class="card"><h2>Unterscheiden sich Gruppen?</h2><p class="muted">Niveau und Änderung über die Zeit vergleichen, weitere Merkmale berücksichtigen.</p>${button('Genotypvergleich vorbereiten','start',true)}</div><div class="card"><h2>Wann wird ein Grenzwert erreicht?</h2><p class="muted">Einen geschätzten Trend für definierte Profile fortschreiben.</p>${button('Trendfortschreibung vorbereiten','projection-start')}</div></div>`;
  return `<div class="page-heading"><div><p class="eyebrow">03 / Analysen</p><h1>Genotypen im Verlauf vergleichen</h1><p class="muted">Beispielkohorte · ${count()} Personen · ${count()*6} Messungen</p></div><button type="button" data-action="export" ${fresh()&&validTargets()?'':'disabled'}>Bericht exportieren</button></div><div class="columns"><section class="card"><div class="card-header"><h2>Ergebnisse</h2><span class="badge ${fresh()?'green':'amber'}">${fresh()?'Beispielergebnis':'Konfiguration offen'}</span></div><div class="tabs" role="group" aria-label="Ergebnisansichten">${['Überblick','Grenzwerte','Nachvollziehen'].map(tab=>`<button data-tab="${tab}" aria-pressed="${state.tab===tab}">${tab}</button>`).join('')}</div>${!fresh()?`<div class="empty"><h2>${state.result?'Konfiguration geändert':'Bereit für den Vergleich'}</h2><p class="muted">${state.result?'Aktualisiere das Beispiel, bevor du Ergebnisse beurteilst oder exportierst.':'Zeige ein illustratives Ergebnis zu dieser Konfiguration an.'}</p>${button('Beispielergebnis ansehen','run',true)}</div>`:state.tab==='Grenzwerte'?projections():state.tab==='Nachvollziehen'?`<h2>Was liegt diesem Ergebnis zugrunde?</h2><p class="formula">${escape(formula())}</p><p class="muted">Zeit: Jahre seit erster Messung. Referenz: Genotyp A, Ausgangsalter 50 Jahre, weiblich. Zufälliger Achsenabschnitt und zufällige Steigung pro Person.</p><p>${state.age==='off'?'Keine Ausschlüsse wegen fehlenden Alters.':'2 Personen mit fehlendem Ausgangsalter ausgeschlossen (047, 048).'}</p><p class="notice">Alle Ergebniswerte sind fest vorgegeben. Die Auswahl zeigt den Bedienablauf; ein statistisches Modell wird hier nicht berechnet.</p>`:`<h2>${escape(state.response)}: Gruppenverläufe</h2><p class="muted">Referenzprofil: Alter₀ 50 Jahre · weiblich · Genotyp A / B</p>${chart()}<p class="notice good">Niveau und Steigung sind getrennte Fragen. Die Grafik illustriert beide; sie ist kein statistischer Befund.</p>`}</section><aside class="card" aria-label="Analyse konfigurieren"><p class="eyebrow">Konfiguration</p><h2>Was soll verglichen werden?</h2>${responseSelect()}<p class="field">Vergleichsfaktor<strong>Genotyp · Referenz A</strong></p><div class="section-rule"></div><h3>Weitere Einflussfaktoren</h3><p class="subtext">„Niveau + Änderung“ berücksichtigt das Merkmal auch für die jährliche Steigung.</p>${select('Alter bei erster Messung','age',[['both','Niveau + jährliche Änderung'],['level','Nur Niveau'],['off','Nicht einbeziehen']])}${select('Geschlecht','sex',[['both','Niveau + jährliche Änderung'],['level','Nur Niveau'],['off','Nicht einbeziehen']])}<details><summary>Modellformel lesen</summary><p class="formula">${escape(formula())}</p><p class="subtext">× enthält Haupteffekte und Wechselwirkung. Alter₀ bleibt das Ausgangsalter; Zeit × Alter₀ lässt die Steigung vom Ausgangsalter abhängen.</p></details><p class="notice ${state.age==='off'?'':'amber'}">${state.age==='off'?'48 Personen eingeschlossen.':'46 von 48 Personen eingeschlossen. Bei 2 Personen fehlt das Ausgangsalter.'}</p>${button(fresh()?'Beispiel erneut ansehen':'Beispiel aktualisieren','run',true)}</aside></div>`;
}
function render() {
  root.innerHTML = `<header class="topbar"><div class="brand"><svg width="27" height="27" viewBox="0 0 28 28" aria-hidden="true"><path d="M3 4v21h23M5 10l6 3 6-5 8 9" fill="none" stroke="currentColor" stroke-width="2"/></svg>Trajektorien</div><nav class="nav" aria-label="Hauptnavigation">${['Daten','Verläufe','Analysen'].map(page=>`<button data-page="${page}" ${state.page===page?'aria-current="page"':''} ${!state.loaded&&page!=='Daten'?'disabled':''}>${page}</button>`).join('')}</nav><div class="top-actions"><span class="badge">Entwurf · Beispieldaten</span></div></header><main id="content" class="workspace">${state.page==='Daten'?dataPage():state.page==='Verläufe'?trajectoriesPage():analysisPage()}</main><footer class="prototype-footer">Klick-Prototyp · Alle Daten und Ergebnisse sind illustrativ · Nur für Forschungszwecke</footer>`;
}
function showDialog(title, body) {
  dialog.innerHTML = `<button class="dialog-close quiet" data-action="close" aria-label="Dialog schließen">✕</button><h2 id="dialog-title">${title}</h2>${body}`;
  dialog.showModal();
}
function report() {
  return `<h1>Illustrativer Analysebericht</h1><p>Klick-Prototyp · Beispieldaten · Keine Modellberechnung · Nur für Forschungszwecke</p><h2>Konfiguration</h2><p>${escape(formula())}</p><p>${count()} Personen, ${count()*6} Messungen; ${48-count()} Personen wegen fehlenden Alters ausgeschlossen.</p><p>Referenzprofil: Genotyp A/B, Ausgangsalter 50 Jahre, weiblich.</p>${projections(true)}`;
}
document.addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.page) state.page=target.dataset.page;
  if (target.dataset.tab) state.tab=target.dataset.tab;
  const action=target.dataset.action;
  if (action==='load') state.loaded=true;
  if (action==='trajectories') state.page='Verläufe';
  if (action==='patient') state.patient=!state.patient;
  if (action==='start'||action==='projection-start') { state.started=true; state.page='Analysen'; state.tab=action==='projection-start'?'Grenzwerte':'Überblick'; }
  if (action==='run') { state.result=fingerprint(); document.querySelector('#announcement').textContent='Illustratives Beispielergebnis aktualisiert.'; }
  if (action==='import') { showDialog('Import im späteren Arbeitsablauf','<p>Hier werden Dateien ausgewählt, Spalten zugeordnet und die Datenqualität geprüft. Der Klick-Prototyp öffnet ausschließlich feste Beispieldaten.</p>'+button('Beispieldaten öffnen','dialog-load',true)); return; }
  if (action==='dialog-load') { state.loaded=true; dialog.close(); }
  if (action==='close') { dialog.close(); return; }
  if (action==='export'&&fresh()&&validTargets()) { showDialog('Bericht prüfen',`<div class="report">${report()}</div>${button('HTML-Bericht herunterladen','download',true)}`); return; }
  if (action==='download'&&fresh()&&validTargets()) {
    const url=URL.createObjectURL(new Blob([`<!doctype html><html lang="de"><meta charset="utf-8"><title>Illustrativer Analysebericht</title><body>${report()}</body></html>`],{type:'text/html;charset=utf-8'}));
    const link=document.createElement('a'); link.href=url; link.download='prototyp-analysebericht.html'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); return;
  }
  render();
  const selector = target.dataset.tab ? `[data-tab="${target.dataset.tab}"]` : target.dataset.page ? `[data-page="${target.dataset.page}"]` : `[data-action="${action}"]`;
  const focusTarget = root.querySelector(selector) || root.querySelector('h1');
  if (focusTarget) { if (focusTarget.tagName === 'H1') focusTarget.tabIndex = -1; focusTarget.focus(); }
});
root.addEventListener('input', event => {
  const key=event.target.dataset.field;
  if (!['threshold','horizon'].includes(key)) return;
  state[key]=event.target.value===''?NaN:Number(event.target.value);
  const fragment=document.createElement('template'); fragment.innerHTML=projections();
  root.querySelector('.projection-result')?.replaceWith(fragment.content.querySelector('.projection-result'));
  const exportButton=root.querySelector('[data-action="export"]');
  if (exportButton) exportButton.disabled=!fresh()||!validTargets();
});
root.addEventListener('change', event => {
  const key=event.target.dataset.field; if (!key || ['threshold','horizon'].includes(key)) return;
  state[key]=['threshold','horizon'].includes(key)?(event.target.value===''?NaN:Number(event.target.value)):event.target.value;
  if(key==='response') { state.threshold=state.response==='eGFR'?30:110; state.direction=state.response==='eGFR'?'down':'up'; }
  render();
  root.querySelector(`[data-field="${key}"]`)?.focus();
});
render();
