import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import {
  COMPUTED_EGFR_UNIT,
  computedEgfrName,
  creatinineSourceOptions,
  EXPORT_DISCLAIMER_ROWS,
  fitPresetCatalog,
  loadDatasetFromWorkbook,
  patientIdKey,
  type LoadedDataset,
} from '@halbritter-lab/kidney-trajectories'
import { aggregate, countBy, distinctDates, EGFR_FORMULAS, METHOD_REFERENCE_URL, RESEARCH_USE, runCohort, type CohortOptions } from './cohort.js'

const day = (date: Date) => date.toISOString().slice(0, 10)

const PRIVACY = 'Tool results are sent to the MCP client and from there to the model provider. Use pseudonymised data only.'

/** Every result is JSON text carrying the research-use statement. */
const result = (body: object) => ({
  content: [{ type: 'text' as const, text: JSON.stringify({ ...body, research_use: RESEARCH_USE }, null, 2) }],
})

/** Local absolute file paths only: no URLs, no UNC or network shares. */
function localPath(path: string, extensions: readonly string[]): string {
  if (/^[a-z][a-z0-9+.-]+:\/\//i.test(path) || /^(\\\\|\/\/)/.test(path)) throw new Error('Only local file paths are accepted, not URLs or network shares.')
  if (!isAbsolute(path)) throw new Error('Pass an absolute local path.')
  if (!extensions.includes(extname(path).toLowerCase())) throw new Error(`Expected a ${extensions.join(', ')} file.`)
  return path
}

const cohortInput = {
  dataset_id: z.string().describe('Id returned by load_dataset.'),
  series: z.string().optional().describe('Series name (Bezeichnung) from list_series. Defaults to the computed eGFR when egfr_formula is set.'),
  unit: z.string().optional().describe('Series unit; needed only when a name occurs with several units.'),
  preset: z.string().default('ckd_progression').describe(`Analysis preset: ${fitPresetCatalog.map((p) => p.id).join(', ')}.`),
  egfr_formula: z.enum(EGFR_FORMULAS).optional().describe('Compute eGFR from serum creatinine with this equation (as the app does when a formula is chosen).'),
  creatinine_source: z.tuple([z.string(), z.string()]).optional().describe('[name, unit] of the serum creatinine series for eGFR; the app default when omitted.'),
}

type CohortArgs = { dataset_id: string; series?: string; unit?: string; preset: string; egfr_formula?: CohortOptions['egfrFormula']; creatinine_source?: [string, string] }

export function createServer(): McpServer {
  const server = new McpServer({ name: 'lab-trajectory-mcp', version: '0.1.0' })
  const datasets = new Map<string, { fileName: string; dataset: LoadedDataset }>()
  let nextId = 1

  const get = (id: string) => {
    const entry = datasets.get(id)
    if (!entry) throw new Error(`Unknown dataset_id "${id}". Call load_dataset first.`)
    return entry
  }
  const cohortFor = (args: CohortArgs) => runCohort(get(args.dataset_id).dataset, {
    series: args.series, unit: args.unit, preset: args.preset, egfrFormula: args.egfr_formula, creatinineSource: args.creatinine_source,
  })

  server.registerTool('load_dataset', {
    title: 'Load a local workbook',
    description: `Read a local .xlsx, .xls or .csv workbook (labs sheet, optional events and attributes sheets) into server memory and return aggregate counts and import diagnostics. Absolute local paths only. Returns no patient identifiers. ${PRIVACY}`,
    inputSchema: { path: z.string().describe('Absolute local path to the workbook.') },
  }, async ({ path }) => {
    const file = localPath(path, ['.xlsx', '.xls', '.csv'])
    const dataset = loadDatasetFromWorkbook(await readFile(file))
    if (!dataset.rows.length) throw new Error('No usable lab values in this file.')
    const id = `ds${nextId++}`
    datasets.set(id, { fileName: basename(file), dataset })
    // Row-level diagnostic texts can quote raw cell values (e.g. birth dates), so only sheet notes are returned verbatim.
    const rowLevel = dataset.diagnostics.filter((d) => d.scope !== 'sheet')
    return result({
      dataset_id: id,
      file: basename(file),
      sheets: dataset.sheetNames,
      patients: new Set(dataset.rows.map((r) => patientIdKey(r.patientId))).size,
      lab_rows: dataset.rows.length,
      series: seriesSummary(dataset),
      events: dataset.events.length,
      rejected_events: dataset.rejectedEvents.length,
      patients_with_attributes: Object.keys(dataset.patientAttributes).length,
      diagnostics: {
        sheet_notes: dataset.diagnostics.filter((d) => d.scope === 'sheet').map((d) => ({ sheet: d.sheet, severity: d.severity, note: d.reason })),
        row_level_counts: countBy(rowLevel.map((d) => `${d.sheet}: ${d.severity}`)),
        row_level_note: 'Row-level messages are counted, not listed, because they can quote raw cell values. Review them in the web app.',
      },
    })
  })

  server.registerTool('list_series', {
    title: 'List series',
    description: 'List the lab series of a loaded dataset with unit, measurement and patient counts, and the eGFR series that can be computed. Aggregate only.',
    inputSchema: { dataset_id: z.string() },
  }, async ({ dataset_id }) => {
    const { dataset } = get(dataset_id)
    const sources = creatinineSourceOptions(dataset.rows)
    return result({
      dataset_id,
      series: seriesSummary(dataset),
      computable_egfr: sources.length
        ? { creatinine_sources: sources, series: EGFR_FORMULAS.map((formula) => ({ egfr_formula: formula, series: computedEgfrName(formula), unit: COMPUTED_EGFR_UNIT })) }
        : null,
    })
  })

  server.registerTool('analyse_cohort', {
    title: 'Analyse a cohort',
    description: `Run the web app's cohort pipeline (dataset modules, per-patient slope fits, AKI exclusion, censoring, CKD endpoints, G5 projection) for one series and preset, and return cohort-level aggregates plus the exact method settings. No patient identifiers. ${PRIVACY}`,
    inputSchema: cohortInput,
  }, async (args) => {
    const { cohort, records, method, analysisMessages } = cohortFor(args)
    return result({ dataset_id: args.dataset_id, method, aggregate: aggregate(cohort, records), analysis_message_count: analysisMessages })
  })

  server.registerTool('patient_detail', {
    title: 'One patient (patient-level data)',
    description: `PATIENT-LEVEL DATA. Use only when the user explicitly asks about one patient by ID. Returns that patient's slope, confidence interval, fitted points, distinct dates, span, no-fit reason, AKI episodes and endpoints for one series and preset. The result is sent to the model provider; prefer export_cohort for patient-level results. ${PRIVACY}`,
    inputSchema: { ...cohortInput, patient_id: z.string().describe('Patient ID as it appears in the workbook, supplied by the user.') },
  }, async ({ patient_id, ...args }) => {
    const { cohort, records, method } = cohortFor(args)
    const index = cohort.findIndex((row) => patientIdKey(row.patientId) === patient_id)
    if (index < 0) throw new Error('Patient ID not found in this dataset.')
    const cell = cohort[index].cells[0]
    const { PatientID: _omit, ...record } = records[index]
    return result({
      dataset_id: args.dataset_id,
      patient_id,
      method,
      result: record,
      n_fitted: cell.nFitted,
      fitted_span_days: cell.fittedSpanDays,
      distinct_measurement_dates: distinctDates(cell),
      excluded_points_by_reason: Object.fromEntries([...new Set(cell.pointExclusionReasons.flat())].map((r) => [r, cell.pointExclusionReasons.filter((rs) => rs.includes(r)).length])),
      // The AKI module's chart overlays: episode markers at the creatinine peak and the merged windows.
      aki_episodes: cell.overlays.flatMap((o) => o.moduleId === 'aki' && o.kind === 'marker' ? [{ peak_date: day(o.date), label: o.label, detail: o.title }] : []),
      aki_windows: cell.overlays.flatMap((o) => o.moduleId === 'aki' && o.kind === 'band' ? [{ start: day(o.start), end: day(o.end) }] : []),
    })
  })

  server.registerTool('export_cohort', {
    title: 'Export per-patient results to a local file',
    description: 'Write the per-patient results (one row per patient, the web app\'s cohort export columns) to a local .xlsx or .csv file and return only the path and row count. This is the way to obtain patient-level results without sending them to the model. Never overwrites an existing file.',
    inputSchema: { ...cohortInput, output_path: z.string().describe('Absolute local path of the new .xlsx or .csv file.') },
  }, async ({ output_path, ...args }) => {
    const file = localPath(output_path, ['.xlsx', '.csv'])
    const { cohort, records, method } = cohortFor(args)
    // n counts raw measurements; add the fitted counts the app's export adds too.
    const rows = records.map((record, i) => ({ ...record, n_fitted: cohort[i].cells[0].nFitted, fitted_span_days: cohort[i].cells[0].fittedSpanDays }))
    const about = [...EXPORT_DISCLAIMER_ROWS, { note: `Source file: ${get(args.dataset_id).fileName}` }, { note: `Method reference: ${METHOD_REFERENCE_URL}` }]
    let bytes: Uint8Array | string
    if (extname(file).toLowerCase() === '.csv') {
      // One table per CSV, so the research-use notes lead as '#' comment lines.
      bytes = `${about.map((row) => `# ${String(row.note)}`).join('\n')}\n${XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows))}\n`
    } else {
      const book = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'cohort')
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([Object.fromEntries(Object.entries(method).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]))]), 'settings')
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(about), 'about')
      bytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array
    }
    await writeFile(file, bytes, { flag: 'wx' })
    return result({ path: file, rows: rows.length, method })
  })

  server.registerTool('methods_reference', {
    title: 'Method reference',
    description: 'Where the method reference lives, the available presets and eGFR equations, and the research-use statement.',
  }, async () => result({
    method_reference: METHOD_REFERENCE_URL,
    presets: fitPresetCatalog.map((p) => ({ id: p.id, name: p.name, description: p.description })),
    egfr_formulas: EGFR_FORMULAS,
    export_notes: EXPORT_DISCLAIMER_ROWS.map((row) => row.note),
    data_protection: PRIVACY,
  }))

  return server
}

/** Series name, unit, measurement rows and patients; no identifiers. */
function seriesSummary(dataset: LoadedDataset) {
  const bySeries = new Map<string, { series: string | null; unit: string | null; rows: number; patients: Set<string> }>()
  for (const row of dataset.rows) {
    const key = JSON.stringify([row.bezeichnung, row.einheit])
    const entry = bySeries.get(key) ?? { series: row.bezeichnung, unit: row.einheit, rows: 0, patients: new Set<string>() }
    entry.rows++
    entry.patients.add(patientIdKey(row.patientId))
    bySeries.set(key, entry)
  }
  return [...bySeries.values()].map(({ patients, ...entry }) => ({ ...entry, patients: patients.size }))
}
