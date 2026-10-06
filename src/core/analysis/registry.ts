/**
 * The module registry: the one place that lists analysis modules. Core code
 * reaches domain behaviour only through this list and the contract in
 * ./types.ts. To add a module, append it here (see docs/architecture.md).
 */
import { demographicsModule } from './demographicsModule'
import { egfrModule } from '../domains/nephrology/egfr/egfrModule'
import { clinicalEventsModule } from '../domains/nephrology/clinicalEventsModule'
import { akiModule } from '../domains/nephrology/aki/akiModule'
import { rapidEgfrDeclineModule } from '../domains/nephrology/rapidEgfrDeclineModule'
import { ckdEndpointsModule } from '../domains/nephrology/endpoints/ckdEndpointsModule'
import type {
  AnalysisModule,
  AnalysisResult,
  CellFlagContext,
  CohortFlag,
  EndpointContext,
  ManualDemographics,
  ModuleExportCell,
  SettingsModule,
} from './types'
import { STANDARD_PRESETS, type FitPresetDefinition } from './fitConfig'
import { NEPHROLOGY_PRESETS } from '../domains/nephrology/fitConfig'
import type { ProjectionTarget } from '../projection/linearProjection'
import type { ClinicalEvent } from '../events/events'
import type { LabRow } from '../types'

/** Every analysis module, in pipeline order: dataset contributions of earlier
 * modules (e.g. derived eGFR rows) are visible to later ones, and windows,
 * flags and export columns appear in this order. */
export const analysisModules = [
  demographicsModule,
  egfrModule,
  clinicalEventsModule,
  akiModule,
  rapidEgfrDeclineModule,
  ckdEndpointsModule,
] as const

type RegisteredModule = (typeof analysisModules)[number]

/** Every selectable analysis preset: the standard ones, then each domain's. */
export const fitPresetCatalog: readonly FitPresetDefinition[] = [...STANDARD_PRESETS, ...NEPHROLOGY_PRESETS]

export function fitPresetById(id: string): FitPresetDefinition | undefined {
  return fitPresetCatalog.find((preset) => preset.id === id)
}

/** Stored analysis settings: one entry per module with settings, keyed by
 * module id. Derived from the registry, so a new module's settings type
 * appears here when the module is added to the list. */
export type AnalysisSettings = {
  [M in RegisteredModule as M extends { parseSettings(value: unknown): unknown } ? M['id'] : never]:
    M extends { parseSettings(value: unknown): infer S } ? NonNullable<S> : never
}

type EndpointResultsOf<M> = M extends { endpoints(ctx: EndpointContext): infer R } ? R : never
type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (i: infer I) => void ? I : never

/** A cohort cell's endpoint results: every endpoint module's results merged,
 * typed from the registry (today the CKD endpoints). */
export type CellEndpoints = UnionToIntersection<EndpointResultsOf<RegisteredModule>>

/** A column's own module settings (e.g. its rapid-decline threshold). */
export type ColumnModuleSettings = Partial<AnalysisSettings>

/** Any module, whatever its settings type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RegisteredAnalysisModule = AnalysisModule<any, string>

function isSettingsModule(module: RegisteredAnalysisModule): module is SettingsModule<unknown, string> {
  return module.defaultSettings !== undefined && typeof module.parseSettings === 'function'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function defaultAnalysisSettings(): AnalysisSettings {
  const settings: Record<string, unknown> = {}
  for (const module of analysisModules as readonly RegisteredAnalysisModule[]) {
    if (isSettingsModule(module)) settings[module.id] = { ...(module.defaultSettings as object) }
  }
  return settings as AnalysisSettings
}

/**
 * Validate stored settings module by module. A module missing from the
 * stored value gets its defaults, so adding a module never invalidates a
 * saved workspace; a value a module rejects makes the whole value invalid.
 * Valid module values are kept as stored.
 */
export function parseAnalysisSettings(value: unknown): AnalysisSettings | null {
  if (!isRecord(value)) return null
  const parsed: Record<string, unknown> = {}
  for (const module of analysisModules as readonly RegisteredAnalysisModule[]) {
    if (!isSettingsModule(module)) continue
    const stored = value[module.id]
    if (stored === undefined) {
      parsed[module.id] = { ...(module.defaultSettings as object) }
      continue
    }
    const settings = module.parseSettings(stored)
    if (settings === null) return null
    parsed[module.id] = settings
  }
  return parsed as AnalysisSettings
}

/** Default per-column settings: a copy of each column-configurable module's
 * defaults. */
export function defaultColumnModuleSettings(): ColumnModuleSettings {
  const settings: Record<string, unknown> = {}
  for (const module of analysisModules as readonly RegisteredAnalysisModule[]) {
    if (module.columnSettingFields?.length && module.defaultSettings !== undefined) settings[module.id] = { ...module.defaultSettings }
  }
  return settings as ColumnModuleSettings
}

/** Modules a column can configure, in registry order. */
export function columnSettingModules(modules: readonly RegisteredAnalysisModule[] = analysisModules): RegisteredAnalysisModule[] {
  return modules.filter((module) => (module.columnSettingFields?.length ?? 0) > 0)
}

/** Modules that draw chart overlays, in registry order. */
export function overlayModules(modules: readonly RegisteredAnalysisModule[] = analysisModules): RegisteredAnalysisModule[] {
  return modules.filter((module) => module.overlayPresentation !== undefined)
}

/** Projection targets every module offers for a fitted outcome. */
export function projectionTargetPresets(
  response: { outcome: string; unit: string },
  modules: readonly RegisteredAnalysisModule[] = analysisModules,
): ProjectionTarget[] {
  return modules.flatMap((module) => module.projectionTargets?.(response) ?? [])
}

/** Readable label of an exclusion reason, from the module that produces it. */
export function exclusionReasonLabel(reason: string, modules: readonly RegisteredAnalysisModule[] = analysisModules): string {
  for (const module of modules) {
    const label = module.exclusionReasonLabels?.[reason]
    if (label !== undefined) return label
  }
  return reason
}

/** Flags that depend on the fitted cell, for one column's module settings.
 * A module is evaluated only when the column configures it. */
export function moduleCellFlags(
  ctx: CellFlagContext,
  columnSettings: ColumnModuleSettings | undefined,
  modules: readonly RegisteredAnalysisModule[] = analysisModules,
): CohortFlag[] {
  if (!columnSettings) return []
  const settings = columnSettings as Record<string, unknown>
  return modules.flatMap((module) => module.cellFlags && settings[module.id] !== undefined
    ? module.cellFlags(ctx, settings[module.id])
    : [])
}

/** Every endpoint module's results for one cell, merged in registry order. */
export function moduleEndpoints(ctx: EndpointContext, modules: readonly RegisteredAnalysisModule[] = analysisModules): CellEndpoints {
  const results: object[] = []
  for (const module of modules) {
    const result = module.endpoints?.(ctx)
    if (result) results.push(result)
  }
  return (results.length === 1 ? results[0] : Object.assign({}, ...results)) as CellEndpoints
}

/** Module export columns for one cell, in registry order. */
export function moduleExportValues(
  cell: ModuleExportCell<CellEndpoints>,
  modules: readonly RegisteredAnalysisModule[] = analysisModules,
): Record<string, string | number> {
  const values: Record<string, string | number> = {}
  for (const module of modules) for (const column of module.exportColumns ?? []) values[column.key] = column.value(cell)
  return values
}

export interface ComputeAnalysisResultOptions {
  rows: LabRow[]
  manualDemographics: Record<string, ManualDemographics>
  patientAttributes: Record<string, Record<string, string>>
  events: ClinicalEvent[]
  settings: AnalysisSettings
  modules?: readonly RegisteredAnalysisModule[]
}

/** Run every module's dataset phase in registry order. */
export function computeAnalysisResult({
  rows,
  manualDemographics,
  patientAttributes,
  events,
  settings,
  modules = analysisModules,
}: ComputeAnalysisResultOptions): AnalysisResult {
  let currentRows = rows
  const result: AnalysisResult = { rows, messages: [], fitInputs: [] }
  const byId = settings as Record<string, unknown>

  for (const module of modules) {
    if (!module.apply) continue
    const contribution = module.apply(
      { rows: currentRows, manualDemographics, patientAttributes, events },
      byId[module.id] ?? module.defaultSettings,
    )
    if (contribution.rows) {
      currentRows = contribution.rows
      result.rows = contribution.rows
    }
    if (contribution.messages) result.messages.push(...contribution.messages)
    if (contribution.fitInputs) result.fitInputs.push(...contribution.fitInputs)
  }

  return result
}
