import {getPresets, savePreset, presetUsage} from './series-evaluations.js';
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function bindPresets(root, render, parameters) {
  let draft, key = parameters[0].key;
  const target = () => draft.targets[key] ?? {threshold:null,direction:'below',horizon:10};
  function fields() {
    const p=parameters.find(p=>p.key===key), t=target();
    return `<label class="field">Optionaler Grenzwert (${p.unit})<input data-preset-field="threshold" type="number" value="${t.threshold??''}"></label><div class="inline-fields"><label class="field">Richtung<select data-preset-field="direction"><option value="below" ${t.direction==='below'?'selected':''}>Unterhalb (&lt;)</option><option value="above" ${t.direction==='above'?'selected':''}>Oberhalb (&gt;)</option></select></label><label class="field">Horizont ab letzter einbezogener Messung (Jahre)<input data-preset-field="horizon" type="number" value="${t.horizon}"></label></div>`;
  }
  function valid() {
    return draft.name.trim() && Number.isFinite(draft.from) && Number.isFinite(draft.to) && draft.from>=0 && draft.to>draft.from && Object.values(draft.targets).every(t=>t.threshold===null || (Number.isFinite(t.threshold)&&Number.isFinite(t.horizon)&&t.horizon>0));
  }
  function preview() {
    root.querySelector('#preset-preview').textContent=valid()?`Vorschau: ${draft.name}, OLS, Jahr ${draft.from}–${draft.to}. Änderungen gelten nach Übernehmen für ${presetUsage(draft.id)} ausdrücklich zugeordnete Parameter; „Linearer Verlauf“ gilt auch als Standard für neue Zuordnungen.`:'Bitte Namen, gültiges Zeitfenster und positive Projektionshorizonte prüfen.';
    root.querySelector('[data-preset-action="save"]').disabled=!valid();
  }
  function editor() {
    return `<dialog id="preset-dialog" aria-labelledby="preset-title"><h2 id="preset-title">Auswertungskonfigurationen</h2><p class="muted">Einmal definieren, mehreren Parametern zuordnen. Sichtbare Kennzahlen wählst du separat in den Ansichten.</p><div class="actions"><label class="field">Konfiguration<select data-preset-field="selected">${getPresets().map(p=>`<option value="${p.id}" ${draft.id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}${getPresets().some(p=>p.id===draft.id)?'':`<option selected value="${draft.id}">${esc(draft.name)}</option>`}</select></label><button data-preset-action="copy">Als neue Konfiguration kopieren</button></div><label class="field">Name<input data-preset-field="name" value="${esc(draft.name)}"></label><p class="subtext">Methode: OLS · keine Zeitbalancierung oder Ereignisausschlüsse in diesem Prototyp. Weitere produktive Verfahren bleiben vorgesehen.</p><div class="inline-fields"><label class="field">Ab Jahr<input data-preset-field="from" type="number" value="${draft.from}"></label><label class="field">Bis Jahr<input data-preset-field="to" type="number" value="${draft.to}"></label></div><h3>Grenzwerte je Parameter</h3><label class="field">Parameter<select data-preset-field="parameter">${parameters.map(p=>`<option value="${p.key}" ${p.key===key?'selected':''}>${p.name} · ${p.unit}</option>`).join('')}</select></label><div id="preset-target-fields">${fields()}</div><p class="subtext">Leer lassen: kein Grenzwert für diesen Parameter. Die Einheit bleibt an die Messgröße gebunden.</p><p id="preset-preview" class="notice" role="status"></p><div class="actions"><button data-preset-action="cancel">Abbrechen</button><button data-preset-action="save" class="primary">Prüfen und übernehmen</button></div></dialog>`;
  }
  function openEditor() {
    root.querySelector('#preset-dialog')?.remove();
    root.insertAdjacentHTML('beforeend',editor());
    const modal=root.querySelector('#preset-dialog'); modal.showModal();
    modal.addEventListener('close',()=>{modal.remove();root.querySelector('[data-preset-action="open"]')?.focus();},{once:true});
    preview();
  }
  root.addEventListener('click',event=>{
    const name=event.target.closest('[data-preset-action]')?.dataset.presetAction;
    if(!name)return;
    if(name==='open'){draft=getPresets()[0];openEditor();}
    if(name==='copy'){draft={...structuredClone(draft),id:`preset-${Date.now()}`,name:`${draft.name} – Kopie`};openEditor();}
    if(name==='cancel')root.querySelector('#preset-dialog').close();
    if(name==='save'&&valid()){savePreset(draft);root.querySelector('#preset-dialog').close();render();root.querySelector('[data-preset-action="open"]')?.focus();}
  });
  root.addEventListener('input',event=>{
    const field=event.target.dataset.presetField;
    if(!['name','from','to','threshold','horizon'].includes(field))return;
    const value=field==='name'?event.target.value:event.target.value===''?null:Number(event.target.value);
    if(['threshold','horizon'].includes(field))draft.targets[key]={...target(),[field]:value};else draft[field]=value;
    preview();
  });
  root.addEventListener('change',event=>{
    const field=event.target.dataset.presetField;
    if(field==='selected'){draft=getPresets().find(p=>p.id===event.target.value);openEditor();}
    if(field==='parameter'){key=event.target.value;root.querySelector('#preset-target-fields').innerHTML=fields();}
    if(field==='direction'){draft.targets[key]={...target(),direction:event.target.value};preview();}
  });
}
