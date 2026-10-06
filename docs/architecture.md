# Analysis architecture

The analysis core separates reusable calculations from clinical decisions. The
workspace imports and orchestrates the core; domain modules supply clinical
rules through the analysis registry. This structure lets a new analyte reuse
the same fits, exclusions, endpoints and projections without teaching the
generic calculations its clinical meaning.

## Layers and dependencies

| Layer | Location | Responsibility |
| --- | --- | --- |
| Generic primitives | `src/core/stats`, `fitPipeline`, `exclusions`, `endpoints`, `projection`, `grouping`, `parse`, `demographics` | Date/value parsing, fits, windows, threshold calculations, grouping and demographic resolution. These directories must not import `domains`, `analysis`, `events`, `io` or `workspace`. |
| Domain packages | `src/core/domains/<domain>/` | Analyte names and units, clinical constants, rules, modules and domain presets. They may call generic primitives. |
| Analysis contract and registry | `src/core/analysis/types.ts`, `registry.ts`, `fitConfig.ts` | Defines module hooks, validates stored module settings, runs dataset hooks and gathers module outputs. The registry is the composition point that imports domain modules. |
| Cohort orchestration | `src/core/cohort/` | Runs modules for each patient and series, prepares fits and endpoint results, and builds cells and exports. |
| App boundary | `src/workspace/`, `src/io/` | Imports workbooks, stores workspaces and renders analysis results. |

`tests/core/architecture.test.ts` checks the generic directories' source
imports. If a calculation needs a clinical rule, put that rule in a domain
module and pass its result through a hook or input type. The generic code can
then consume a window, point or target without importing the domain.

## Module contract

`AnalysisModule` and its context and output types live in
`src/core/analysis/types.ts`. A module has a stable `id` and a `label`. The
registry calls hooks in the order listed in `analysisModules`:

1. `apply(ctx, settings)` runs once per analysis. It can add derived rows,
   messages and dataset-level fit inputs. Rows added by an earlier module are
   visible to later modules.
2. `series(ctx)` runs for each patient and series before fitting. It can return
   censoring windows, fit exclusion windows, overlays and cohort flags.
3. `endpoints(ctx)` computes results for a patient and series using the generic
   endpoint helpers. Its result joins the cell's `endpoints` object.
4. `cellFlags(ctx, settings)` runs after fitting for columns with that module's
   settings. It can use the fitted slope to add flags.

Optional metadata supplies `appliesTo`, export columns, overlay presentation,
exclusion reason labels and mixed-model `projectionTargets`. The workspace and
cohort code consume these through the registry. A module that stores settings
also supplies `defaultSettings` and `parseSettings(value)`. The parser must
return valid settings or `null`; `parseAnalysisSettings` rejects invalid stored
values and fills a missing module from its defaults. A new module ID therefore
does not invalidate older saved workspaces. Stable IDs and export keys matter
for saved data and exports.

Column fit presets are separate from modules. `fitPresetCatalog` in the
registry combines standard and domain preset definitions. A preset builds a
complete `FitConfig`, while module hooks provide analysis behavior. Add a
preset only when users need a selectable fit policy.

## Example: add HbA1c with a 7 % target

This example adds a projection target for an HbA1c outcome measured in `%`.
The target is a crossing of a fitted line, not a clinical prognosis. The
existing projection helper uses `direction: 'below'` for values strictly below
the threshold. At exactly 7, a non-flat line reports a crossing at the
reference time. Pick and test any other boundary convention explicitly.

1. Create `src/core/domains/diabetes/`. Put names, accepted units and any
   conversion policy in that folder. Match the imported HbA1c series by both
   outcome name and unit. Do not silently apply a 7 % threshold to `mmol/mol`
   data; add an explicit conversion or a separate target if that unit is needed.
2. Add `hba1cModule.ts` there. For a target alone, it needs no persisted
   settings or fit hooks. A minimal module is:

   ```ts
   import type { AnalysisModule } from '../../analysis/types'

   export const hba1cModule = {
     id: 'hba1c',
     label: 'HbA1c',
     projectionTargets: (response: { outcome: string; unit: string }) =>
       response.outcome === 'HbA1c' && response.unit === '%'
         ? [{ id: 'hba1c-7-percent', label: '7 % target',
              outcome: response.outcome, unit: response.unit,
              threshold: 7, direction: 'below' as const }]
         : [],
   } satisfies AnalysisModule<undefined, 'hba1c'>
   ```

   Adapt the name predicate to the actual imported labels. If the module also
   computes endpoints or flags, implement the corresponding hooks with
   `src/core/endpoints` or `src/core/stats` helpers. Give it
   `defaultSettings` and `parseSettings` only if a user setting must persist.
3. Import `hba1cModule` and add it to `analysisModules` in
   `src/core/analysis/registry.ts`. Its position controls hook and output
   order. `projectionTargetPresets` then offers its target for matching model
   outcomes; no generic projection code needs an HbA1c branch.
4. Optionally define a `FitPresetDefinition` in the new domain and include it
   in `fitPresetCatalog`. The present `FitConfig`, preset IDs and menu category
   types include nephrology-specific fields and categories, so a new diabetes
   preset also requires an explicit type/UI extension. Keep that work separate
   from the target-only module when no new fit policy is needed.
5. Test the module predicate and target, settings validation if it has
   settings, and the relevant consumer behavior. Run the focused tests,
   `pnpm test` and `pnpm build`. A clinical or numeric change also follows the
   owner-decision and fixture process in `CLAUDE.md` and
   `docs/method-algorithms.md`.
