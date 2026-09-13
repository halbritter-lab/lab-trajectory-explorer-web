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
export function getEvaluation(key) {
  return settings.get(key) ?? {features:[], threshold:null, direction:'below', horizon:10};
}
export function setEvaluation(key, config) { settings.set(key, structuredClone(config)); }
export function validEvaluation(config) {
  return !config.features.includes('projection') || (Number.isFinite(config.threshold) && Number.isFinite(config.horizon) && config.horizon > 0);
}
export function evaluateSeries(points, parameter) {
  const config = getEvaluation(parameter.key);
  const fit = fitOls(points.map(p=>p.time), points.map(p=>p.value));
  const projection = projectLinearThreshold({
    intercept:fit.intercept, slopePerYear:fit.slope, outcome:parameter.key, unit:parameter.unit,
    referenceTimeYears:points.at(-1).time, horizonYears:config.horizon,
    target:{id:parameter.key, label:parameter.name, outcome:parameter.key, unit:parameter.unit,
      threshold:config.threshold ?? NaN, direction:config.direction},
  });
  return {config,fit,projection};
}
const format = value => Number.isFinite(value) ? value.toLocaleString('de-DE',{maximumFractionDigits:2}) : 'nicht verfügbar';
export function evaluationValues(points, parameter) {
  const {config,fit,projection} = evaluateSeries(points,parameter);
  if (!config.features.length) return '';
  const values = [];
  if (config.features.includes('trend')) values.push('<span>Gestrichelt: OLS-Trend</span>');
  if (config.features.includes('slope')) values.push(`<span>Änderung: <strong>${format(fit.slope)} ${parameter.unit}/Jahr</strong></span>`);
  if (config.features.includes('r2')) values.push(`<span>R²: <strong>${format(fit.r2)}</strong></span>`);
  if (config.features.includes('projection')) {
    const statuses = {already_met:'Trend am letzten Messzeitpunkt bereits erfüllt',flat:'Keine Steigung',away:'Trend in Gegenrichtung',beyond_horizon:'Außerhalb des Horizonts',invalid:'Nicht berechenbar',incompatible_target:'Unpassendes Ziel'};
    const result = projection.status==='crossing' ? `${format(projection.remainingYears)} Jahre ab letzter Messung` : statuses[projection.status];
    values.push(`<span>Grenzwert ${config.direction==='below'?'&lt;':'&gt;'} ${format(config.threshold)} ${parameter.unit}: <strong>${result}</strong></span>`);
  }
  return `<div class="series-evaluation-values">${values.join('')}<small>OLS aus synthetischen Beispieldaten</small></div>`;
}
