# Attribute Grouping And Per-Group Cohort Analysis Design

## Goal

Let a user group the cohort by any per-patient attribute and analyze the groups
side by side: color the trajectory overlay by group with a legend and per-group
fit lines, fit the cohort mixed model once per group, and carry a group column
into the cohort table and export.

This is the generic, **domain-neutral** counterpart to the patient-attributes
ingestion (Spec A). The app assigns no meaning to attribute names; "group by
genotype" is just "group by the attribute column named whatever the user picked".
All disease/ORPHA specifics stay in the data folder, never in the repo.

Research and exploratory analysis only; not clinical decision support.

## Scope

In scope:

1. A pure grouping model: assign each cohort patient to a group from a chosen
   attribute value.
2. A "Group by" selector in the cohort view (lists attribute names present on
   loaded patients; plus "No grouping").
3. Grouped trajectory overlay: per-group color, a legend, and one fit/mean line
   per group.
4. Per-group cohort mixed model: fit once per group, store and display N
   results. Implemented **additively** — the existing single (pooled) fit path
   stays intact and is used when no grouping is active.
5. A group column in the cohort table and the xlsx export.

Non-goals (defer):

- Grouped table *sections* with group-tiered sorting (a single group column is
  enough; no section headers).
- Statistical group comparison (p-values, group contrasts).
- Persisting the group-by selection.
- Per-group endpoints/KM curves.

## Domain Neutrality

No genotype/ADTKD/ORPHA strings or logic in the repo. The grouping key is a
string attribute name chosen at runtime; group values are whatever strings the
attribute holds. A colorblind-safe categorical palette is used regardless of
group meaning.

## Grouping Model

New pure module `src/core/grouping/grouping.ts`:

```ts
export interface PatientGroup {
  value: string          // attribute value, or the ungrouped sentinel
  patientIds: PatientId[]
}

export const UNGROUPED = '(ungrouped)'

// Build ordered groups for the given cohort patients and chosen attribute.
// value = byPatient[patientIdKey(id)]?.[attributeName] (trimmed) or UNGROUPED.
// Groups: named values sorted (numeric-aware), UNGROUPED always last.
export function groupPatients(
  patientIds: readonly PatientId[],
  byPatient: Record<string, Record<string, string>>,
  attributeName: string,
): PatientGroup[]

// Stable value->color map. Named groups take palette colors in group order;
// UNGROUPED is a fixed neutral gray. Palette is Okabe-Ito (colorblind-safe).
export function groupColors(groups: readonly PatientGroup[]): Map<string, string>
```

Okabe-Ito palette (first two match the reference analysis's group colors):

```text
#0072B2 #D55E00 #009E73 #CC79A7 #E69F00 #56B4E9 #F0E442 #000000
UNGROUPED -> #9aa0a6
```

`groupColors` cycles the palette if there are more named groups than colors.

## Store Changes

`src/ui/state/store.ts`:

- Add `cohortGroupByAttribute: string | null` (default `null`).
- Add `setCohortGroupByAttribute(name: string | null)`. Setting it clears
  `mixedModelResult`, `mixedModelResultsByGroup`, and `showCohortMixedModelLine`
  (changing the grouping invalidates all fits).
- Add `mixedModelResultsByGroup: Record<string, StoredMixedModelResult> | null`
  (default `null`) plus `setMixedModelResultsByGroup` and a clear path.
- Include both new fields in the `AppData` reset Pick and `initialState`.
- `setDataset` clears `cohortGroupByAttribute` (back to null) and
  `mixedModelResultsByGroup` along with the existing cleared fields.
- Every setter that already clears `mixedModelResult` (selected patients,
  cohort mode, series config/preset/fitconfig, events, mixed model config)
  must also clear `mixedModelResultsByGroup`. Add a small helper to keep the two
  clears in sync.

## Selector Placement

Place "Group by" in the always-visible cohort controls in
`src/ui/cohort/CohortView.tsx` (next to the Table/Overlay display-mode toggle,
~line 250), not inside the overlay-only toolbar, so it applies to both table and
overlay. Options: `No grouping` + the sorted union of attribute names present on
**cohort** patients:

```ts
// attribute names from patientAttributes restricted to current cohort patients
```

If no attributes are loaded, the selector is hidden (or disabled with a hint).

## Grouped Overlay

`src/ui/cohort/cohortOverlayData.ts`: add optional `group?: string` to
`CohortOverlayPoint`; the points builder looks up each patient's group via the
grouping model and stamps it.

`src/ui/cohort/CohortTrajectoryOverlay.tsx`:

- Color trajectory lines by `group` using a Plot color scale driven by
  `groupColors` (keep the existing highlight/hover emphasis on top — e.g.
  highlighted patient keeps a heavier stroke, others use their group color).
- Render a legend (custom SVG/DOM layer, modeled on the existing event-label
  layer) mapping group value -> color, shown only when grouping is active.
- Mean/fit lines: when grouping is active and `mixedModelResultsByGroup` exists,
  draw one mean line per group (via the existing `mixedModelMeanLinePoints`)
  in the group color. When not grouping, keep the current single pooled line.
- When grouping is active but no per-group mixed model has been run, fall back
  to per-group OLS mean lines so the overlay is immediately useful without webR.

## Per-Group Mixed Model (additive)

Core: reuse `mixedModelRowsFromCohortInputs(allRows, groupPatientIds, spec)` per
group (just pass the group's patient ids). Add a helper
`mixedModelRowsByGroup(allRows, groups, spec)` returning
`Record<groupValue, MixedModelSpikeRow[]>` (skipping groups with too few rows).

Identity (`src/core/mixedModel/resultIdentity.ts`): add optional
`groupValue?: string` to `MixedModelResultIdentity`; include it in
`buildMixedModelResultIdentity` and `mixedModelIdentityEquals`. Existing pooled
fits leave it undefined, preserving current behavior and tests.

Fit flow: when grouping is active, the cohort mixed-model run iterates groups
and calls `runMixedModelWorkerJob` **sequentially** with `reuseWorker: true`
(the webR runtime loads once and is reused), accumulating
`mixedModelResultsByGroup`. Per-group failures are isolated: a failed group is
recorded with its failure result and does not abort the others; the UI shows a
per-group status. This is built as a parallel path to the existing single-fit
flow, which is unchanged and used when grouping is off.

UI: the cohort mixed-model panel/result area, when grouping is active, shows one
row per group (group value, n patients, slope + CI or failure), reusing the
existing per-result rendering. Keep the existing "Experimental" treatment.

## Table And Export Group Column

`src/core/cohort/screening.ts`: add optional `groupValue?: string` to
`CohortRow`; `buildCohortRows` accepts the active attribute name + attributes
map and stamps each row's group. `cohortExportRecords` adds a `group` column
when grouping is active.

`src/ui/cohort/CohortView.tsx`: when grouping is active, render a "Group" column
as the first table column. No section grouping or group-tiered sort in this
spec; the existing sort still applies.

## Testing Strategy

Core (unit, deterministic):

- `groupPatients`: value lookup, UNGROUPED for missing/blank, ordering
  (numeric-aware, UNGROUPED last), patients partitioned correctly.
- `groupColors`: stable mapping, UNGROUPED gray, palette cycling.
- `mixedModelRowsByGroup`: rows partitioned by group; small groups skipped.
- identity: `groupValue` distinguishes identities; undefined preserves
  existing equality.
- `cohortExportRecords`: includes `group` when grouping active, omits otherwise.
- `buildCohortRows`: stamps `groupValue`.

UI:

- store: `setCohortGroupByAttribute` sets value and clears both result stores;
  `setDataset` resets grouping.
- CohortView: selector lists cohort attribute names + "No grouping"; table shows
  Group column when active.
- overlay data: points carry the right `group`.
- export: exported workbook's `cohort` sheet has a `group` column when grouping
  active.
- per-group fit flow: with grouping active, fitting produces
  `mixedModelResultsByGroup` with one entry per eligible group (worker mocked,
  mirroring existing mixed-model UI tests).

Full `pnpm vitest run` and `pnpm exec tsc -b` must stay green throughout; no
regressions to existing mixed-model/overlay/table/export tests.

## Implementation Phases

1. Grouping core (`grouping.ts`) + colors + tests.
2. Store: `cohortGroupByAttribute` + `mixedModelResultsByGroup` + invalidation + tests.
3. Selector in CohortView + cohort attribute-name computation + tests.
4. Table + export group column (`screening.ts`, CohortView) + tests.
5. Grouped overlay: group points + color scale + legend + per-group OLS mean
   lines + tests.
6. Per-group mixed model: `mixedModelRowsByGroup`, identity `groupValue`,
   sequential fit flow, per-group results UI, per-group mixed-model mean lines
   in the overlay + tests.

Phases 1-4 are low risk and land first. Phase 5 adds the visual grouping. Phase
6 (per-group mixed model) is the highest-risk, built additively last.

## Acceptance Criteria

- Selecting a group-by attribute partitions the cohort; missing values fall into
  a single `(ungrouped)` group shown last.
- The overlay colors trajectories by group with a legend and per-group fit
  lines; with no per-group mixed model yet, per-group OLS lines are shown.
- Running the cohort mixed model with grouping active produces one result per
  eligible group; a failed group does not abort the others.
- The cohort table and export include a `group` column when grouping is active,
  and are unchanged when it is not.
- With no grouping selected, all existing behavior (pooled fit, single mean
  line, table, export) is byte-for-byte unchanged.
- All ORPHA/genotype logic stays out of the repo; the feature is generic.
- `pnpm vitest run` and `pnpm exec tsc -b` are green.
