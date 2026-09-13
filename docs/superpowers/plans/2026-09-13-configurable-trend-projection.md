# Configurable trend projection implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable threshold projections for fitted model profiles, with renal presets and custom targets.

**Architecture:** Pure generic linear projection, explicit mixed-model adapter, reusable React editor and provenance-preserving export. Projection settings do not affect model fitting.

**Tech Stack:** TypeScript, React, Vitest, Playwright, existing webR and SheetJS.

**Spec:** `docs/superpowers/specs/2026-09-13-configurable-trend-projection-design.md`.

## Global constraints

- Keep numeric parity fixtures and legacy latest-measurement projections unchanged.
- Never silently convert units, drop model terms or reuse stale model results.
- Report conditional projections; no event-time model or fabricated time CI.
- Preserve PR #11 as the factor feature; execute production changes on a dependent feature branch or after its merge.
- Read `CLAUDE.md` and the spec before execution; review code before completion.

## Task 1: General projection contract and calculator

Create `src/core/projection/linearProjection.ts` and
`tests/core/projection/linearProjection.test.ts`.

```ts
interface ProjectionTarget {
  id: string; label: string; outcome: string; unit: string
  threshold: number; direction: 'below' | 'above'
}
interface LinearProjectionInput {
  intercept: number; slopePerYear: number; outcome: string; unit: string
  referenceTimeYears: number; horizonYears: number; target: ProjectionTarget
}
type ProjectionStatus = 'crossing' | 'already_met' | 'flat' | 'away'
  | 'beyond_horizon' | 'invalid' | 'incompatible_target'
interface LinearProjectionResult {
  status: ProjectionStatus
  modelTimeYears: number | null; remainingYears: number | null
}
// Export these types and projectLinearThreshold(input): LinearProjectionResult.
```

- [ ] Write red tests, including `expect(projectLinearThreshold({intercept:60,slopePerYear:-3,outcome:'eGFR',unit:'u',referenceTimeYears:2,horizonYears:20,target:{id:'custom',label:'Study target',outcome:'eGFR',unit:'u',threshold:30,direction:'below'}})).toEqual({status:'crossing',modelTimeYears:10,remainingYears:8})`.
- [ ] Add the acceptance examples and all boundary cases in the spec; verify failure with `pnpm exec vitest run tests/core/projection/linearProjection.test.ts`.
- [ ] Implement input validation, strict-side checks, equality handling, `(threshold-intercept)/slopePerYear`, finite-result checks on both derived times, then horizon filtering in that order. Failed states have null time fields.
- [ ] Add the overflow regression with `intercept:1`, `slopePerYear:-Number.MIN_VALUE`, threshold 0, direction below, reference 0 and horizon 20; expect `{status:'invalid',modelTimeYears:null,remainingYears:null}`. Also test finite tiny-slope crossings beyond the horizon to distinguish the states.
- [ ] Rerun the focused test and commit the independently tested calculator.

## Task 2: Fitted mixed-model profile adapter

Create `src/core/mixedModel/projectionProfile.ts` and
`tests/core/mixedModel/projectionProfile.test.ts`; consume existing `MixedModelSuccess`,
`mixedModelFactors` and `mixedModelFactorColumn`.

```ts
type ProjectionProfile = Record<string, string | number>
type ProfileLine = {status:'ready';intercept:number;slopePerYear:number}
  | {status:'unavailable';reason:string}
// resolveProjectionProfile(result: MixedModelSuccess,
//   profile: ProjectionProfile): ProfileLine
```

- [ ] Test numeric raw-to-centered conversion, nonreference categorical effects and all level/slope combinations against manually calculated a and b. Include category labels containing colons and generated-column-like text.
- [ ] Test missing required centers/terms, invalid numeric values, unknown categories and failed/nonconverged fits at their caller boundary. Do not accept nonfinite coefficients.
- [ ] Construct exact coefficient names from generated columns and selected category data. Sum main effects into a and time interactions into b. References legitimately contribute zero; an absent nonreference coefficient fails.
- [ ] Preserve legacy age-adjusted fits using stored centering metadata. Run adapter, identity and configured-factor tests; commit.

## Task 3: Editor, presets and source-fit integration

Create `src/core/projection/targetPresets.ts`, `src/ui/cohort/ModelProjectionPanel.tsx`
and `tests/ui/ModelProjectionPanel.test.tsx`. Modify
`src/ui/cohort/CohortModelTable.tsx` to render the panel from stored successful,
identity-matched model results and pass the fitted category choices. Also modify
`src/ui/cohort/CohortView.tsx`, `src/ui/shell/Sidebar.tsx`,
`src/ui/cohort/CohortTrajectoryOverlay.tsx`, and `src/ui/state/store.ts`;
extend their existing tests for explicit series selection and invalidation.
Create `src/core/projection/projectionSnapshot.ts` for shared settings/snapshot
contracts and the pure snapshot builder, plus its focused core test file.

```ts
interface ProjectionSettings {
  targets: Array<ProjectionTarget & {enabled:boolean}>; profile: ProjectionProfile
  referenceTimeYears: number; horizonYears: number
}
interface AppliedProjectionSettings {
  sourceIdentity: MixedModelResultIdentity; settings: ProjectionSettings
}
interface ProjectionResponse { outcome: string; unit: string }
interface ProjectionSnapshot {
  sourceResponse: ProjectionResponse
  sourceResult: MixedModelSuccess; sourceIdentity: MixedModelResultIdentity
  settings: ProjectionSettings; line: ProfileLine
  rows: Array<{
    target: ProjectionTarget & {enabled:boolean}
    status: ProjectionStatus | 'disabled' | 'unavailable_profile'
    reason: string | null; modelTimeYears: number | null
    remainingYears: number | null
  }>
}
// buildProjectionSnapshot(result: MixedModelSuccess,
//   identity: MixedModelResultIdentity, sourceResponse: ProjectionResponse,
//   preparedRows: readonly MixedModelSpikeRow[],
//   settings: ProjectionSettings): ProjectionSnapshot
// Types come from tasks 1/2 and existing mixedModel/types/resultIdentity.
// ModelProjectionPanel receives current stored result + identity, sourceResponse,
// prepared rows,
// applied settings, onApply and onDirtyChange. It owns only the local draft.
// Caller checks converged/identity before calling the builder. Validate settings
// on apply and defensively in the builder; malformed snapshots cannot export.
```

- [ ] Test adding/editing/removing custom targets, below/above direction, reference/horizon validation, reference-profile defaults and changed-profile recalculation without calling runJob.
- [ ] Add G4/G5 boundary preset definitions as data (30/15, below) bound to compatible eGFR outcome/unit. Test no automatic renal presets for unrelated series or incompatible units.
- [ ] Render a labeled table of statuses/times, fitted-curve anchor and explicit unavailable time uncertainty. Keep invalid draft settings visible without presenting a result as valid.
- [ ] Add session-only `projectionSettings` in `src/ui/state/store.ts`, keyed by `JSON.stringify([seriesIndex,seriesKey,entityKey])`, storing `AppliedProjectionSettings`. Initialize defaults once per identity; clear on identity invalidation/entity removal/dataset reset and exclude from persistence. Do not store derived rows.
- [ ] Add local drafts with `Apply projection settings` and Cancel. Validate finite numeric inputs, nonempty labels, unique IDs and unit binding even for disabled targets; reject malformed applies. Closing the dialog discards drafts, while applied settings survive reopen. Report dirty state to the table and disable its model-export button while an included editor is dirty.
- [ ] Derive fitted category choices from identity-matched prepared entity rows after factor exclusions, not raw attributes. Disabled targets bypass calculation and produce disabled/null rows. Failed profile resolution produces unavailable_profile/reason/null rows. Keep fit warnings alongside the snapshot.
- [ ] Pass `sourceResponse` from the identity-matched selected series spec into the panel, builder and snapshot; validate targets against that binding, never infer source units from targets or split delimiter-based identity keys. Preserve this binding even with zero configured targets. Implement `buildProjectionSnapshot` to combine the current fit object, applied settings and prepared rows. Recompute when any input changes. UI and export consume that same snapshot; check current source object and identity again at export. Same-identity refits preserve settings but recompute coefficients; changed identities reset them.
- [ ] Test disable/re-enable, invalid apply, Cancel, dialog reopen, series switch/removal, stale data and same-identity refits returning different coefficients. Verify no export uses stale or draft values.
- [ ] Replace `Sidebar.tsx`'s eGFR-only model-button gate with a numeric-series entry point that supplies its index. Add `mixedModelSeriesIndex: number | null`, `mixedModelSeriesKey: string | null`, and an open action taking both index and key in `store.ts`. Reset/close on series replacement/removal; validate the bound series key so index reuse cannot retarget a fit.
- [ ] Replace `CohortView.tsx`'s first-eGFR `findIndex` with the explicitly selected series; pass its spec/key/unit into preparation, fitting and display. Update dialog titles/accessibility labels and display-only formula response names; retain the internal eGFR worker column for compatibility. Preserve renal-only gates for rapid-decline/legacy endpoint controls.
- [ ] Update `CohortTrajectoryOverlay.tsx` to use the same explicit series selection and identity. Test two eligible numeric series, selecting the second, replacement at the same index, and no renal presets or incorrectly labeled overlay for the non-eGFR result.
- [ ] Run focused UI/core tests and commit.

## Task 4: Export and browser acceptance

Modify `src/core/mixedModel/modelExport.ts`, `src/ui/cohort/CohortModelTable.tsx`
and their tests; add `tests/e2e/model-projections.e2e.ts`.

- [ ] Extend export input with `projection?: ProjectionSnapshot` from task 3; require its sourceResult to be the exported current result and its sourceIdentity to match the current identity. Reject mismatches before creating a file. Existing callers without projections preserve existing sheets.
- [ ] Add a `projections` sheet with target/profile JSON, outcome/unit, source identity JSON, a/b (null for unavailable profile), enabled flag, reference/horizon, status/reason, model/remaining years, anchor and `time_uncertainty: 'not estimated'`.
- [ ] Roundtrip XLSX bytes and verify every displayed target/status, nonreference profile and source settings survive. Disabled targets and unavailable profiles retain explicit statuses/reasons with empty time fields. Test dirty-editor export blocking and current-result checks, including same-identity refits.
- [ ] Use a workbook browser scenario to select a model, configure custom/preset targets, change profile and download/read the actual XLSX. Fit with real webR in an explicit runtime acceptance script if CI requires an injected worker seam; distinguish the two verification modes.
- [ ] Include a rising non-eGFR series, a beyond-horizon target and a stale-data change in acceptance coverage.
- [ ] Run `pnpm test`, `pnpm build`, `pnpm exec playwright test --workers=1`, and actual webR profile fits. Verify `git diff -- tests/goldens tests/parity` is empty.
- [ ] Review the final diff, fix findings, rerun affected checks, update changelog and smoke verification record, commit and open a dependent draft PR. Keep #4 open for remaining scope.
