// Existing numeric functions, applied only to the prototype's synthetic series.
import { fitOls } from '../../src/core/stats/ols.ts';
import { projectLinearThreshold } from '../../src/core/projection/linearProjection.ts';

export const evaluationMethods = [
  {key:'trend', label:'Lineare Trendlinie (OLS)'},
  {key:'slope', label:'Jährliche Änderung'},
  {key:'r2', label:'Anpassung (R²)'},
  {key:'projection', label:'Grenzwertzeitpunkt'},
];
const settings = new Map();
const presets = new Map([
  ['full',{id:'full',name:'Linearer Verlauf',from:0,to:5,targets:{}}],
  ['recent',{id:'recent',name:'Letzte drei Jahre',from:2,to:5,targets:{}}],
]);
export function getPresets() { return [...presets.values()].map(p=>structuredClone(p)); }
export function savePreset(preset) { presets.set(preset.id,structuredClone(preset)); }
export function presetUsage(id) { return [...settings.values()].filter(s=>s.presetId===id).length; }
export function getEvaluation(key) {
  const selected = settings.get(key) ?? {features:[],presetId:'full'};
  const preset = presets.get(selected.presetId);
  const target = preset.targets[key] ?? {threshold:null,direction:'below',horizon:10};
  return {...selected,...target,from:preset.from,to:preset.to,presetName:preset.name};
}
export function setEvaluation(key, config) { settings.set(key,{features:[...config.features],presetId:config.presetId}); }
export function validEvaluation(config) { return presets.has(config.presetId); }
export function evaluateSeries(points, parameter) {
  const config = getEvaluation(parameter.key);
  const included = points.filter(p=>p.time>=config.from && p.time<=config.to);
  const fit = fitOls(included.map(p=>p.time), included.map(p=>p.value));
  const projection = projectLinearThreshold({
    intercept:fit.intercept, slopePerYear:fit.slope, outcome:parameter.key, unit:parameter.unit,
    referenceTimeYears:included.at(-1)?.time ?? NaN, horizonYears:config.horizon,
    target:{id:parameter.key, label:parameter.name, outcome:parameter.key, unit:parameter.unit,
      threshold:config.threshold ?? NaN, direction:config.direction},
  });
  return {config,fit,projection,included};
}
const format = value => Number.isFinite(value) ? value.toLocaleString('de-DE',{maximumFractionDigits:2}) : 'nicht verfügbar';
export function evaluationValues(points, parameter) {
  const {config,fit,projection} = evaluateSeries(points,parameter);
  if (!config.features.length) return '';
  const values = [];
  if (!points.length) return '<p class="subtext">Keine Messwerte verfügbar.</p>';
  if (fit.reason) return '<p class="notice">Auswertung nicht möglich: mindestens drei Messpunkte mit verschiedenen Zeiten im gewählten Zeitfenster erforderlich.</p>';
  if (config.features.includes('trend')) values.push('<span>Gestrichelt: OLS-Trend</span>');
  if (config.features.includes('slope')) values.push(`<span>Änderung: <strong>${format(fit.slope)} ${parameter.unit}/Jahr</strong></span>`);
  if (config.features.includes('r2')) values.push(`<span>R²: <strong>${format(fit.r2)}</strong></span>`);
  if (config.features.includes('projection')) {
    const statuses = {already_met:'Trend am letzten einbezogenen Messzeitpunkt bereits erfüllt',flat:'Keine Steigung',away:'Trend in Gegenrichtung',beyond_horizon:'Außerhalb des Horizonts',invalid:'Nicht berechenbar',incompatible_target:'Unpassendes Ziel'};
    const result = config.threshold===null ? 'Grenzwert in der Konfiguration festlegen' : projection.status==='crossing' ? `${format(projection.remainingYears)} Jahre ab letzter einbezogener Messung` : statuses[projection.status];
    values.push(`<span>Grenzwert ${config.direction==='below'?'&lt;':'&gt;'} ${format(config.threshold)} ${parameter.unit}: <strong>${result}</strong></span>`);
  }
  return `<div class="series-evaluation-values">${values.join('')}<small>OLS · Fenster Jahr ${config.from}–${config.to} · synthetische Daten</small></div>`;
}
