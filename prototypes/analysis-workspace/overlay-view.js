import {getEvaluation,evaluateSeries} from './series-evaluations.js';

const settings={axis:'baseline',groupBy:'genotype',connect:true,points:false,events:false,hidden:[],highlight:''};
const format=n=>n.toLocaleString('de-DE',{maximumFractionDigits:1});
const yearMs=365.25*24*60*60*1000;
const groupOf=p=>settings.groupBy==='genotype'?`Genotyp ${p.group}`:settings.groupBy==='sex'?(p.sex==='w'?'weiblich':'männlich'):'Alle';
const axisValue=(patient,time)=>settings.axis==='age'?patient.baselineAge+time:settings.axis==='date'?Date.parse(patient.baselineDate)+time*yearMs:time;
const axisLabel=()=>settings.axis==='age'?'Alter (Jahre)':settings.axis==='date'?'Kalenderdatum (synthetisch)':'Jahre seit erster Messung';
const select=(label,key,options)=>`<label class="field">${label}<select data-overlay-field="${key}">${options.map(([v,t])=>`<option value="${v}" ${settings[key]===v?'selected':''}>${t}</option>`).join('')}</select></label>`;

export function overlayView(rows, selected, parameters, series, evaluationButton) {
  if(settings.highlight && !rows.some(p=>p.id===settings.highlight))settings.highlight='';
  const controls=`<section class="card overlay-controls" aria-label="Plot-Einstellungen"><div class="overlay-control-grid">${select('Zeitachse','axis',[['baseline','Jahre seit erster Messung'],['age','Alter'],['date','Kalenderdatum']])}${select('Färben nach','groupBy',[['genotype','Genotyp'],['sex','Geschlecht'],['none','Keine Gruppierung']])}<label class="field">Person hervorheben<select data-overlay-field="highlight"><option value="">Keine</option>${rows.map(p=>`<option value="${p.id}" ${settings.highlight===p.id?'selected':''}>${p.id}</option>`).join('')}</select></label></div><details class="overlay-display"><summary>Darstellung</summary><div class="overlay-checks">${[['points','Messpunkte'],['connect','Verbindungslinien'],['events','Ereignisse']].map(([key,label])=>`<label><input type="checkbox" data-overlay-field="${key}" ${settings[key]?'checked':''}>${label}</label>`).join('')}<label><input type="checkbox" disabled>Ausgeschlossene Messungen</label><label><input type="checkbox" disabled>Kohortenmodell-Linien</label></div><p class="subtext">Keine Messungen ausgeschlossen. Für diese Daten liegt im Prototyp kein passendes berechnetes Kohortenmodell vor. Ereignisse sind illustrative Studienbesuche und verändern den Fit nicht. Einzelne OLS-Linien werden über „Anzeige“ eingeblendet.</p></details></section>`;
  if(!rows.length)return controls+'<p class="notice">Keine passenden Personen. Patientenauswahl oder Filter ändern.</p>';
  if(!selected.length)return controls+'<p class="notice">Wähle mindestens einen Parameter.</p>';
  return controls+`<div class="patient-toolbar"><div><h2>Verläufe überlagern</h2><p class="muted">${rows.length} Personen in der Auswahl · Linie oder Messpunkt öffnet die Person</p></div></div><div class="overlay-grid">${selected.map(key=>{
    const parameter=parameters.find(p=>p.key===key), config=getEvaluation(key);
    const withData=rows.filter(p=>series(p,key).length);
    const available=withData.filter(p=>settings.axis!=='age'||Number.isFinite(p.baselineAge));
    const groups=[...new Set(available.map(groupOf))].sort();
    const colors=new Map(groups.map(g=>[g,g==='Genotyp B'||g==='männlich'?'#487ca9':'#176c68']));
    const visible=available.filter(p=>!settings.hidden.includes(groupOf(p)));
    const activeHighlight=visible.some(p=>p.id===settings.highlight);
    if(!available.length)return `<section class="card"><h3>${parameter.name} · ${parameter.unit}</h3>${evaluationButton(parameter)}<p class="notice">Keine darstellbaren Verläufe für diese Daten- und Achsenauswahl. Fehlende Werte oder Altersangaben prüfen.</p></section>`;
    const domain=available.flatMap(p=>series(p,key).map(point=>axisValue(p,point.time)));
    const min=domain.length?Math.min(...domain):0,max=domain.length?Math.max(...domain):5;
    const x=value=>45+(value-min)/(max-min||1)*565, y=value=>220-(value-parameter.min)/(parameter.max-parameter.min)*185;
    const clip=`overlay-${key}`;
    return `<section class="card"><div class="card-header"><div><h3>${parameter.name} · ${parameter.unit}</h3><p class="subtext">${visible.length} sichtbar · ${available.length} von ${rows.length} darstellbar · ${config.presetName.replace(/[&<>"']/g,'')} </p></div>${evaluationButton(parameter)}</div>${settings.groupBy!=='none'?`<div class="overlay-group-legend" role="group" aria-label="Gruppen für ${parameter.name}">${groups.map(g=>`<button data-overlay-group="${g}" data-overlay-key="${key}" aria-pressed="${!settings.hidden.includes(g)}"><span class="dot" style="background:${colors.get(g)}"></span>${g}${settings.hidden.includes(g)?' (ausgeblendet)':''}</button>`).join('')}</div>`:''}
    ${!visible.length?'<p class="notice">Keine sichtbaren Verläufe. Gruppen in der Legende einblenden oder Datenbasis prüfen.</p>':''}
    <svg class="overlay-plot" viewBox="0 0 650 290" aria-label="${parameter.name}: ${visible.length} sichtbare Patientenverläufe; ${axisLabel()}"><defs><clipPath id="${clip}"><rect x="45" y="35" width="565" height="185"/></clipPath></defs>
    ${[parameter.min,(parameter.min+parameter.max)/2,parameter.max].map(v=>`<line x1="45" x2="610" y1="${y(v)}" y2="${y(v)}" stroke="#dce5e9"/><text x="40" y="${y(v)+4}" text-anchor="end">${format(v)}</text>`).join('')}
    ${[0,1,2,3,4].map(i=>{const value=min+(max-min)*i/4;return `<text x="${x(value)}" y="247" text-anchor="middle">${settings.axis==='date'?new Date(value).toLocaleDateString('de-DE',{month:'2-digit',year:'numeric',timeZone:'UTC'}):format(value)}</text>`;}).join('')}<text x="330" y="280" text-anchor="middle">${axisLabel()}</text>
    ${visible.map(patient=>{
      const points=series(patient,key), color=colors.get(groupOf(patient))??'#176c68',highlighted=settings.highlight===patient.id;
      const opacity=highlighted ? 1 : activeHighlight ? .25 : .45;
      const {fit}=evaluateSeries(points,parameter);
      const interactive=`data-browser-patient="${patient.id}" tabindex="0" role="button" aria-label="Person ${patient.id} öffnen, ${parameter.name}"`;
      return `${settings.connect?`<polyline ${interactive} data-overlay-person="${patient.id}" points="${points.map(p=>`${x(axisValue(patient,p.time))},${y(p.value)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${highlighted?3:1.5}" stroke-opacity="${opacity}" clip-path="url(#${clip})"><title>Person ${patient.id} · ${groupOf(patient)}</title></polyline>`:''}
        ${settings.points?points.map(p=>`<circle ${interactive} data-overlay-point cx="${x(axisValue(patient,p.time))}" cy="${y(p.value)}" r="${highlighted?4:2.5}" fill="${color}" fill-opacity="${opacity}" clip-path="url(#${clip})"><title>Person ${patient.id}: ${format(p.value)} ${parameter.unit}</title></circle>`).join(''):''}
        ${config.features.includes('trend')&&Number.isFinite(fit.slope)?`<path d="M${x(axisValue(patient,Math.max(0,config.from)))} ${y(fit.intercept+fit.slope*Math.max(0,config.from))} L${x(axisValue(patient,Math.min(5,config.to)))} ${y(fit.intercept+fit.slope*Math.min(5,config.to))}" stroke="${color}" stroke-width="1.5" stroke-opacity="${opacity}" stroke-dasharray="5 4" fill="none" pointer-events="none" clip-path="url(#${clip})"/>`:''}
        ${settings.events&&Number(patient.id)%8===1?`<line data-overlay-event x1="${x(axisValue(patient,2.5))}" x2="${x(axisValue(patient,2.5))}" y1="35" y2="220" stroke="#ac792b" stroke-opacity=".7" stroke-dasharray="2 5" clip-path="url(#${clip})"><title>Person ${patient.id}: illustrativer Studienbesuch, Jahr 2,5</title></line>`:''}`;
    }).join('')}
    ${config.features.includes('projection')&&Number.isFinite(config.threshold)&&config.threshold>=parameter.min&&config.threshold<=parameter.max?`<line x1="45" x2="610" y1="${y(config.threshold)}" y2="${y(config.threshold)}" stroke="#ac792b" stroke-dasharray="4 4"/>`:''}</svg>
    <p class="subtext">${settings.events?'Gepunktet: illustrative Studienbesuche. ':''}${config.features.includes('trend')?'Gestrichelt: OLS je Person. ':''}${rows.length-withData.length} ohne berechenbare Werte; ${withData.length-available.length} zusätzlich ohne Altersachse. Gruppen ausblenden verändert nur den Plot, nicht Auswahl oder Berechnung.</p>${!settings.connect&&!settings.points?'<p class="notice">Messpunkte und Verbindungslinien sind ausgeblendet. Optionale Auswertungslinien bleiben sichtbar.</p>':''}</section>`;
  }).join('')}</div>`;
}

export function bindOverlay(root,render) {
  root.addEventListener('change',event=>{
    const key=event.target.dataset.overlayField;if(!key)return;
    settings[key]=event.target.type==='checkbox'?event.target.checked:event.target.value;
    if(key==='groupBy')settings.hidden=[];
    const open=root.querySelector('.overlay-display')?.open;
    render();if(open)root.querySelector('.overlay-display').open=true;
    root.querySelector(`[data-overlay-field="${key}"]`)?.focus();
  });
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-overlay-group]');if(!button)return;
    const group=button.dataset.overlayGroup,key=button.dataset.overlayKey;
    settings.hidden=settings.hidden.includes(group)?settings.hidden.filter(g=>g!==group):[...settings.hidden,group];
    render();root.querySelector(`[data-overlay-group="${group}"][data-overlay-key="${key}"]`)?.focus();
  });
}
