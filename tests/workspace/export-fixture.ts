import { buildCohortRows } from '../../src/core/cohort/screening'
import type { LabRow } from '../../src/core/types'
import type { WorkspaceData } from '../../src/workspace/workspace-data'

function row(patientId: string, bezeichnung: string, einheit: string, wertNum: number): LabRow {
  return {patientId,bezeichnung,einheit,wertNum,wert:String(wertNum),wertOperator:'=',labDatum:new Date(2024,0,1),patientSex:'w',patientAgeAtLab:55,loinc:null}
}
export function exportFixture() {
  const rawRows = [row('001-A','Marker|one','mg/L',10),row('001-A','Marker|one','g/L',20),row('hidden','Marker|one','mg/L',999),row('001-A','Creatinine','mg/dl',1)]
  const derived = row('001-A','Derived eGFR','ml/min/1.73m2',70)
  const parameters = [{key:'marker',label:'Marker|one (mg/L)',bezeichnung:'Marker|one',einheit:'mg/L',derived:false},{key:'other-unit',label:'Marker|one (g/L)',bezeichnung:'Marker|one',einheit:'g/L',derived:false},{key:'derived',label:'Derived eGFR',bezeichnung:'Derived eGFR',einheit:'ml/min/1.73m2',derived:true}]
  const rows = [...rawRows,derived]
  const data: WorkspaceData = {rawRows,rows,fileName:'source.xlsx',parameters,patients:['001-A','hidden'].map(id => ({id,label:id,attributes:{group:id === 'hidden' ? 'SECRET' : 'A'},baselineAge:55})),events:['001-A','hidden'].map(patientId => ({patientId,type:'other',date:new Date(2024,0,2),title:patientId === 'hidden' ? 'SECRET' : 'Visit',description:null,endDate:null,intent:null,warning:''})),patientAttributes:{'001-A':{group:'A'},hidden:{group:'SECRET'}},manualDemographics:{'001-A':{age:55},hidden:{age:99}},analysis:{rows,messages:[],cohortFlags:[],overlays:[],fitInputs:[]},analysisSettings:{egfr:{formula:'ekfc-2021',source:['Creatinine','mg/dl']},aki:{showOverlays:false,exclusionDays:0},rapidEgfrDecline:{threshold:0}}}
  const cohortRows = buildCohortRows(rows,['001-A','hidden'],parameters.map(parameter => ({bezeichnung:parameter.bezeichnung,einheit:parameter.einheit,mode:'global'})))
  return {data,cohortRows,parameterKeys:['marker','derived'],patientIds:['001-A']}
}

